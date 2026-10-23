// "Migrate it": five decisions in a live MySQL-to-PostgreSQL migration.
// Each choice changes records lost, downtime and time taken; the goal is
// zero lost or corrupted records and under a minute of downtime.
(function () {
	var demo = document.getElementById('migration-demo');
	if (!demo) return;

	var ROWS = 1200000;
	var state;

	function el(id) { return document.getElementById(id); }

	function duration(min) {
		if (min < 1) return Math.round(min * 60) + ' s';
		if (min < 60) return Math.round(min) + ' min';
		return Math.floor(min / 60) + ' h ' + Math.round(min % 60) + ' min';
	}

	// Each option's `pick` updates the state and returns [grade, outcome]
	var steps = [
		{
			question: 'How do you copy the data?',
			context: function () { return 'The shop takes about 30 orders a minute, and existing orders change as they ship.'; },
			options: [
				{ label: 'Put the site in maintenance mode, then dump and restore', pick: function (s) {
					s.down += 45; s.time += 45; s.copy = 'dump';
					return ['bad', 'Nothing can change while you copy, so the data is consistent. But the shop is down for 45 minutes, far past the one-minute goal.'];
				} },
				{ label: 'Copy in batches while the site stays up', pick: function (s) {
					s.copy = 'batches';
					return ['ok', 'The shop stays up. But any order created or changed after its batch is copied will be stale or missing in PostgreSQL. Nothing is tracking those changes.'];
				} },
				{ label: 'Copy in batches and stream changes from the MySQL binlog (change data capture)', pick: function (s) {
					s.copy = 'cdc';
					return ['good', 'The shop stays up, and every insert and update made during the copy is replayed into PostgreSQL.'];
				} }
			]
		},
		{
			question: 'What batch size?',
			context: function () { return 'Each batch reads a primary-key range and writes it in one transaction. The legacy server already runs at 70% CPU at peak.'; },
			options: [
				{ label: '1,000 rows', pick: function (s) {
					s.batch = 1000; if (s.copy !== 'dump') s.time += 320;
					return ['ok', 'Gentle on the old server, but 1,200 batches take over five hours. Safe, just slow.'];
				} },
				{ label: '20,000 rows', pick: function (s) {
					s.batch = 20000; if (s.copy !== 'dump') s.time += 38;
					return ['good', '60 batches in about 38 minutes, with headroom left on the legacy server.'];
				} },
				{ label: '500,000 rows', pick: function (s) {
					s.batch = 500000; if (s.copy !== 'dump') { s.time += 25; s.down += 6; }
					return ['bad', 'Each batch holds locks for minutes. Checkout starts timing out, so the shop is effectively down for about 6 minutes in total.'];
				} }
			]
		},
		{
			question: function (s) { return 'Batch ' + Math.ceil(ROWS / s.batch * 0.6) + ' fails: "Lock wait timeout exceeded." What now?'; },
			context: function () { return 'The batch ran in a single transaction, so it rolled back. None of its rows were written.'; },
			options: [
				{ label: 'Skip it and keep going; fix it later', pick: function (s) {
					s.lost += s.batch;
					return ['bad', 'Nobody comes back for it. ' + s.batch.toLocaleString() + ' orders never reach PostgreSQL.'];
				} },
				{ label: 'Retry that batch', pick: function () {
					return ['good', 'It succeeds on the second try. Because the failed batch rolled back cleanly, retrying it is safe.'];
				} },
				{ label: 'Restart the whole migration from the beginning', pick: function (s) {
					s.time += s.copy === 'dump' ? 45 : s.batch === 1000 ? 320 : 38;
					if (s.copy === 'dump') s.down += 45;
					return ['ok', 'Safe, but you redo every batch that had already succeeded.'];
				} }
			]
		},
		{
			question: 'How do you check the data before switching over?',
			context: function () { return 'MySQL stored text as latin1. PostgreSQL uses UTF-8.'; },
			options: [
				{ label: 'Compare row counts in both databases', pick: function (s) {
					s.time += 2; s.lost += 312;
					return ['bad', 'The counts match, but 312 customer names with accents were garbled in the latin1 to UTF-8 conversion, and nothing flagged them.'];
				} },
				{ label: 'Compare row counts and a checksum for each batch', pick: function (s) {
					s.time += 9;
					return ['good', 'Checksums differ in 4 batches. You trace them to 312 names garbled by the latin1 to UTF-8 conversion, fix the conversion and re-copy those rows.'];
				} },
				{ label: 'Spot-check 100 random rows by hand', pick: function (s) {
					s.time += 20; s.lost += 312;
					return ['bad', 'All 100 look fine. The 312 garbled names are 0.03% of rows, so a random sample almost never finds them.'];
				} }
			]
		},
		{
			question: 'How do you cut over?',
			context: function () { return 'The app servers still write to MySQL. They need to point at PostgreSQL.'; },
			options: [
				{ label: 'Change the connection string and do a normal rolling deploy', pick: function (s) {
					s.time += 3; s.lost += 94;
					return ['bad', 'For the 3 minutes of the rolling deploy, old and new app servers write to different databases. 94 orders land in MySQL after the switch and never reach PostgreSQL.'];
				} },
				{ label: 'Pause writes, let the last changes drain, re-check, then switch', pick: function (s) {
					s.time += 1; s.down += 40 / 60;
					if (s.copy === 'batches') {
						s.lost += 1350;
						return ['bad', 'Writes pause for 40 seconds and the switch is clean. But nothing tracked changes during the copy, so 1,350 orders created or updated since their batch ran are missing or stale.'];
					}
					return ['good', 'Writes pause for 40 seconds while the last changes drain and the checks pass. Then every app server points at PostgreSQL.'];
				} },
				{ label: 'Switch at 3 a.m. without pausing writes; traffic is low', pick: function (s) {
					s.time += 3; s.lost += 6;
					return ['bad', 'Low traffic is not no traffic. 6 orders land in MySQL during the switch and are lost.'];
				} }
			]
		}
	];

	// With a dump and restore, batch size only changes how the restore loads
	steps[1].options.forEach(function (option) {
		var pick = option.pick;
		option.pick = function (s) {
			var result = pick(s);
			return s.copy === 'dump' ? ['ok', 'The site is already down for the dump, so batch size only changes how fast the restore loads. It does not change the outcome.'] : result;
		};
	});

	function text(value) { return typeof value === 'function' ? value(state) : value; }

	function render() {
		el('mg-lost').textContent = state.lost.toLocaleString();
		el('mg-down').textContent = duration(state.down);
		el('mg-time').textContent = duration(state.time);
	}

	function showStep() {
		var step = steps[state.step];
		el('mg-count').textContent = 'Decision ' + (state.step + 1) + ' of ' + steps.length;
		el('mg-question').textContent = text(step.question);
		el('mg-context').textContent = text(step.context);
		el('mg-outcome').textContent = '';
		el('mg-outcome').className = 'mg-outcome';
		el('mg-next').hidden = true;
		var options = el('mg-options');
		options.innerHTML = '';
		// Shuffle so the right answer isn't always in the same place
		step.options.slice().sort(function () { return Math.random() - 0.5; }).forEach(function (option) {
			var button = document.createElement('button');
			button.className = 'mg-option';
			button.type = 'button';
			button.textContent = option.label;
			button.addEventListener('click', function () { choose(option, button); });
			options.appendChild(button);
		});
	}

	function choose(option, button) {
		var result = option.pick(state);
		Array.prototype.forEach.call(el('mg-options').children, function (b) {
			b.disabled = true;
			b.setAttribute('aria-pressed', b === button);
		});
		el('mg-outcome').textContent = result[1];
		el('mg-outcome').className = 'mg-outcome is-' + result[0];
		el('mg-progress').children[state.step].className = 'is-' + result[0];
		render();
		var last = state.step === steps.length - 1;
		el('mg-next').textContent = last ? 'See the result' : 'Next';
		el('mg-next').hidden = false;
		el('mg-next').focus();
	}

	function finish() {
		var met = state.lost === 0 && state.down <= 1;
		el('mg-count').textContent = 'Result';
		el('mg-question').textContent = met ? 'Migration complete. Goal met.' : 'Migration complete. Goal missed.';
		el('mg-context').textContent = met
			? 'Zero records lost or corrupted, ' + duration(state.down) + ' of downtime, done in ' + duration(state.time) + '.'
			: [state.lost ? state.lost.toLocaleString() + ' records lost or corrupted' : '', state.down > 1 ? duration(state.down) + ' of downtime' : '']
				.filter(Boolean).join(' and ') + '. Try a different set of calls.';
		el('mg-options').innerHTML = '';
		el('mg-outcome').textContent = '';
		el('mg-next').textContent = 'Try again';
		el('mg-next').hidden = false;
		state.done = true;
	}

	el('mg-next').addEventListener('click', function () {
		if (state.done) return start();
		state.step++;
		if (state.step < steps.length) showStep(); else finish();
	});

	function start() {
		state = { step: 0, lost: 0, down: 0, time: 0, batch: 20000, copy: null, done: false };
		Array.prototype.forEach.call(el('mg-progress').children, function (li) { li.className = ''; });
		render();
		showStep();
	}

	start();
})();

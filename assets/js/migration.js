// "Migrate it": replays a batched migration of 120,000 records. One batch
// fails, rolls back and is retried; a final check compares counts and
// checksums to show nothing was lost.
(function () {
	var demo = document.getElementById('migration-demo');
	if (!demo) return;

	var BATCHES = 12, SIZE = 10000, FAILS = 6; // the 7th batch hits a lock timeout once
	var run = document.getElementById('mg-run');
	var grid = document.getElementById('mg-batches');
	var log = document.getElementById('mg-log');
	var cells = [];

	for (var i = 0; i < BATCHES; i++) cells.push(grid.appendChild(document.createElement('li')));

	function note(text) {
		var item = document.createElement('li');
		item.textContent = text;
		log.insertBefore(item, log.firstChild);
		while (log.children.length > 4) log.removeChild(log.lastChild);
	}

	function set(id, value) { document.getElementById(id).textContent = value; }

	// Runs each step after the previous one, waiting `ms` before it
	function sequence(steps) {
		var at = 0;
		steps.forEach(function (step) {
			at += step[0];
			setTimeout(step[1], at);
		});
	}

	run.addEventListener('click', function () {
		run.disabled = true;
		log.innerHTML = '';
		cells.forEach(function (c) { c.className = ''; });
		set('mg-copied', '0');
		set('mg-retries', '0');
		set('mg-lost', '–');
		note('Migration started.');

		var copied = 0, steps = [];
		cells.forEach(function (cell, n) {
			var label = 'Batch ' + (n + 1);
			steps.push([350, function () { cell.className = 'is-copying'; }]);
			if (n === FAILS) {
				steps.push([500, function () {
					cell.className = 'is-failed';
					note(label + ' failed: lock timeout. Rolled back, nothing written.');
				}]);
				steps.push([900, function () {
					cell.className = 'is-retrying';
					set('mg-retries', '1');
					note('Retrying ' + label.toLowerCase() + '.');
				}]);
			}
			steps.push([450, function () {
				cell.className = 'is-done';
				copied += SIZE;
				set('mg-copied', copied.toLocaleString());
				if (n === FAILS) note(label + ' committed on retry.');
			}]);
		});
		steps.push([500, function () { note('Verifying: comparing row counts and checksums.'); }]);
		steps.push([900, function () {
			set('mg-lost', '0');
			note('120,000 of 120,000 rows match. Checksums match. 0 records lost.');
			run.textContent = 'Run again';
			run.disabled = false;
		}]);
		sequence(steps);
	});
})();

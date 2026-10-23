// "Tune it": the visitor builds an index for a slow query and reads the
// resulting EXPLAIN ANALYZE output. Plans and timings come from a model of
// how PostgreSQL would treat each column order on the data described in
// the brief; they are illustrative, not measured.
(function () {
	var demo = document.getElementById('query-demo');
	if (!demo) return;

	var GOAL_MS = 1;
	var BASELINE_MS = 1838.2;
	var WIDTH = { customer_id: 4, status: 8, created_at: 8, total: 8 }; // bytes per key column
	var chosen = [], attempts = 0;
	var buttons = demo.querySelectorAll('[data-col]');

	function rows(n) { return n.toLocaleString(); }

	// Approximate B-tree size: 2.4M entries, ~16 bytes overhead each, 90% fill
	function size(cols) {
		var bytes = 16;
		cols.forEach(function (c) { bytes += WIDTH[c]; });
		return Math.round(2400000 * bytes / 0.9 / 1048576) + ' MB';
	}

	function plan(lines, ms) {
		return 'EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)\n\n' + lines.join('\n') +
			'\nPlanning Time: 0.124 ms\nExecution Time: ' + ms.toFixed(ms < 10 ? 3 : 1) + ' ms';
	}

	function seqScan(why) {
		return {
			ms: BASELINE_MS, read: 2400000, why: why,
			lines: [
				'Limit (actual time=1838.101..1838.108 rows=20 loops=1)',
				'  Buffers: shared hit=1024 read=38722',
				'  ->  Sort (actual time=1838.099..1838.103 rows=20 loops=1)',
				'        Sort Key: created_at DESC',
				'        Sort Method: top-N heapsort  Memory: 27kB',
				'        ->  Seq Scan on orders (actual time=0.412..1837.904 rows=42 loops=1)',
				"              Filter: ((customer_id = 4821) AND (status = 'open'::text))",
				'              Rows Removed by Filter: 2399958'
			]
		};
	}

	// Works out the plan PostgreSQL would pick for an index on `cols`
	function evaluate(cols) {
		var name = 'orders_' + cols.join('_') + '_idx';
		var hasCustomer = false, hasStatus = false, i = 0;
		// Equality columns can be used in any order, as long as they lead the index
		while (i < cols.length && (cols[i] === 'customer_id' || cols[i] === 'status')) {
			if (cols[i] === 'customer_id') hasCustomer = true; else hasStatus = true;
			i++;
		}
		var ordered = cols[i] === 'created_at';

		if (!cols.length) return seqScan('No index, so PostgreSQL reads all 2.4 million rows to find 42, then sorts them.');

		if (!hasCustomer && !hasStatus) {
			if (cols[0] === 'created_at') {
				return {
					ms: 2412.6, read: 1184330,
					why: "Worse than no index. With LIMIT 20, the planner bets it will find 20 matches quickly by walking every order newest-first. This customer's orders are spread across the whole table, so it reads half of it.",
					lines: [
						'Limit (actual time=3.114..2412.488 rows=20 loops=1)',
						'  Buffers: shared hit=402118 read=781410',
						'  ->  Index Scan Backward using ' + name + ' on orders (actual time=3.112..2412.471 rows=20 loops=1)',
						"        Filter: ((customer_id = 4821) AND (status = 'open'::text))",
						'        Rows Removed by Filter: 1184310'
					]
				};
			}
			return seqScan('The planner ignores this index. Nothing in the query filters on ' + cols[0] + ', so a full scan is still the cheapest plan.');
		}

		if (hasCustomer && hasStatus) {
			if (ordered) {
				return {
					ms: 0.089, read: 20,
					why: 'The index matches the filter and the sort order, so PostgreSQL reads exactly the 20 rows it returns, already sorted.',
					lines: [
						'Limit (actual time=0.031..0.074 rows=20 loops=1)',
						'  Buffers: shared hit=24',
						'  ->  Index Scan using ' + name + ' on orders (actual time=0.030..0.071 rows=20 loops=1)',
						"        Index Cond: ((customer_id = 4821) AND (status = 'open'::text))"
					]
				};
			}
			return {
				ms: 0.214, read: 42,
				why: 'The index finds exactly the 42 open orders, then a tiny in-memory sort picks the newest 20. Adding created_at would skip the sort, but this smaller index already meets the goal.',
				lines: [
					'Limit (actual time=0.188..0.196 rows=20 loops=1)',
					'  Buffers: shared hit=46',
					'  ->  Sort (actual time=0.187..0.191 rows=20 loops=1)',
					'        Sort Key: created_at DESC',
					'        Sort Method: quicksort  Memory: 27kB',
					'        ->  Bitmap Heap Scan on orders (actual time=0.061..0.162 rows=42 loops=1)',
					"              Recheck Cond: ((customer_id = 4821) AND (status = 'open'::text))",
					'              Heap Blocks: exact=41',
					'              ->  Bitmap Index Scan on ' + name + ' (actual time=0.048..0.048 rows=42 loops=1)',
					"                    Index Cond: ((customer_id = 4821) AND (status = 'open'::text))"
				]
			};
		}

		if (hasCustomer) {
			if (ordered) {
				return {
					ms: 0.118, read: 26,
					why: "Reads this customer's orders newest-first and skips the 6 that aren't open. It meets the goal because open orders are recent. If they weren't, this plan could read all 3,150.",
					lines: [
						'Limit (actual time=0.029..0.101 rows=20 loops=1)',
						'  Buffers: shared hit=30',
						'  ->  Index Scan using ' + name + ' on orders (actual time=0.028..0.098 rows=20 loops=1)',
						'        Index Cond: (customer_id = 4821)',
						"        Filter: (status = 'open'::text)",
						'        Rows Removed by Filter: 6'
					]
				};
			}
			return {
				ms: 6.204, read: 3150,
				why: "Much better than a full scan, but it still fetches all 3,150 of this customer's orders from the table, throws away the 3,108 that aren't open, and sorts the rest.",
				lines: [
					'Limit (actual time=6.171..6.179 rows=20 loops=1)',
					'  Buffers: shared hit=2961 read=214',
					'  ->  Sort (actual time=6.169..6.174 rows=20 loops=1)',
					'        Sort Key: created_at DESC',
					'        Sort Method: top-N heapsort  Memory: 27kB',
					'        ->  Bitmap Heap Scan on orders (actual time=0.402..6.121 rows=42 loops=1)',
					'              Recheck Cond: (customer_id = 4821)',
					"              Filter: (status = 'open'::text)",
					'              Rows Removed by Filter: 3108',
					'              Heap Blocks: exact=3150',
					'              ->  Bitmap Index Scan on ' + name + ' (actual time=0.233..0.233 rows=3150 loops=1)',
					'                    Index Cond: (customer_id = 4821)'
				]
			};
		}

		if (ordered) {
			return {
				ms: 96.4, read: 52890,
				why: "Walks every open order in the shop newest-first, looking for this customer's. Status alone is not selective: 3% of 2.4 million is still 72,000 rows.",
				lines: [
					'Limit (actual time=0.044..96.388 rows=20 loops=1)',
					'  Buffers: shared hit=48211 read=4702',
					'  ->  Index Scan using ' + name + ' on orders (actual time=0.043..96.371 rows=20 loops=1)',
					"        Index Cond: (status = 'open'::text)",
					'        Filter: (customer_id = 4821)',
					'        Rows Removed by Filter: 52870'
				]
			};
		}
		return {
			ms: 141.7, read: 72000,
			why: "Status alone is not selective: the index hands back all 72,000 open orders, and PostgreSQL filters them down to this customer's 42.",
			lines: [
				'Limit (actual time=141.611..141.618 rows=20 loops=1)',
				'  Buffers: shared hit=31877 read=9204',
				'  ->  Sort (actual time=141.609..141.613 rows=20 loops=1)',
				'        Sort Key: created_at DESC',
				'        Sort Method: top-N heapsort  Memory: 27kB',
				'        ->  Bitmap Heap Scan on orders (actual time=9.817..141.522 rows=42 loops=1)',
				"              Recheck Cond: (status = 'open'::text)",
				'              Filter: (customer_id = 4821)',
				'              Rows Removed by Filter: 71958',
				'              ->  Bitmap Index Scan on ' + name + ' (actual time=8.902..8.902 rows=72000 loops=1)',
				"                    Index Cond: (status = 'open'::text)"
			]
		};
	}

	function showIndex() {
		document.getElementById('qp-index').textContent = chosen.length
			? 'CREATE INDEX orders_' + chosen.join('_') + '_idx\n  ON orders (' + chosen.join(', ') + ');'
			: '-- No index yet. Click columns above.';
		Array.prototype.forEach.call(buttons, function (b) {
			var picked = chosen.indexOf(b.getAttribute('data-col')) !== -1;
			b.setAttribute('aria-pressed', picked);
			b.disabled = picked;
		});
	}

	function show(result, cols) {
		var note = document.getElementById('qp-note');
		var unused = cols.filter(function (c) { return c === 'total'; });
		var verdict;
		if (result.ms >= GOAL_MS) {
			verdict = 'Not yet: ' + result.ms.toLocaleString() + ' ms. ';
			note.className = 'qp-note is-fail';
		} else if (result.read === 20 && !unused.length) {
			verdict = 'Perfect score in ' + attempts + (attempts === 1 ? ' attempt. ' : ' attempts. ');
			note.className = 'qp-note is-pass';
		} else {
			verdict = 'Goal met. For a perfect score, read only the 20 rows you return' + (unused.length ? ', with no wasted columns. ' : '. ');
			note.className = 'qp-note is-pass';
		}
		if (unused.length && result.ms < BASELINE_MS) result.why += ' The total column adds size without helping this query.';
		note.textContent = verdict + result.why;
		document.getElementById('qp-time').textContent = result.ms.toLocaleString() + ' ms';
		document.getElementById('qp-rows').textContent = rows(result.read);
		document.getElementById('qp-size').textContent = cols.length ? '≈ ' + size(cols) : '–';
		document.getElementById('qp-plan').textContent = plan(result.lines, result.ms);
		// Log scale, so 0.1 ms is still visible next to 2,400 ms
		document.getElementById('qp-bar').style.width = Math.max(2, Math.log(result.ms + 1) / Math.log(2413) * 100) + '%';
	}

	Array.prototype.forEach.call(buttons, function (b) {
		b.addEventListener('click', function () {
			chosen.push(b.getAttribute('data-col'));
			showIndex();
		});
	});

	document.getElementById('qp-clear').addEventListener('click', function () {
		chosen = [];
		showIndex();
	});

	document.getElementById('qp-run').addEventListener('click', function () {
		attempts++;
		document.getElementById('qp-attempts').textContent = attempts;
		show(evaluate(chosen), chosen.slice());
	});

	showIndex();
	show(evaluate([]), []);
	document.getElementById('qp-note').className = 'qp-note';
	document.getElementById('qp-note').textContent = 'Starting point, with no index: ' + seqScan('').ms.toLocaleString() + ' ms.';
})();

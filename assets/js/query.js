// "Tune it": steps through making one slow query fast, showing the SQL,
// the query plan, and how time and rows read change at each step.
(function () {
	var demo = document.getElementById('query-demo');
	if (!demo) return;

	var steps = [
		{
			sql: "SELECT id, total, created_at\nFROM orders\nWHERE customer_id = 4821\n  AND status = 'open'\nORDER BY created_at DESC\nLIMIT 20;",
			plan: "Limit\n  -> Sort  (created_at DESC)\n       -> Seq Scan on orders\n            Filter: customer_id = 4821 AND status = 'open'\n            Rows removed by filter: 2,399,958",
			ms: 1840,
			rows: 2400000,
			note: "With no index, the database reads all 2.4 million orders to find this customer's 42 open ones, then sorts them."
		},
		{
			sql: "CREATE INDEX orders_customer_idx\n  ON orders (customer_id);",
			plan: "Limit\n  -> Sort  (created_at DESC)\n       -> Bitmap Heap Scan on orders\n            Filter: status = 'open'\n            -> Bitmap Index Scan on orders_customer_idx\n                 Index Cond: customer_id = 4821",
			ms: 38,
			rows: 3150,
			note: "An index on customer_id finds the customer's 3,150 orders quickly, but every one is still read, filtered by status and sorted."
		},
		{
			sql: "CREATE INDEX orders_customer_status_created_idx\n  ON orders (customer_id, status, created_at DESC);",
			plan: "Limit\n  -> Index Scan using orders_customer_status_created_idx on orders\n       Index Cond: customer_id = 4821 AND status = 'open'",
			ms: 0.4,
			rows: 20,
			note: "Matching the index to the query's filter and sort order lets the database read only the 20 rows it returns, already in order. That's about 4,600 times faster than where we started."
		}
	];

	var buttons = demo.querySelectorAll('.qp-step');
	var max = Math.log(steps[0].ms + 1);

	function show(i) {
		var step = steps[i];
		Array.prototype.forEach.call(buttons, function (b, j) { b.setAttribute('aria-pressed', i === j); });
		document.getElementById('qp-sql').textContent = step.sql;
		document.getElementById('qp-plan').textContent = step.plan;
		document.getElementById('qp-time').textContent = step.ms.toLocaleString() + ' ms';
		document.getElementById('qp-rows').textContent = step.rows.toLocaleString();
		document.getElementById('qp-note').textContent = step.note;
		// Log scale, so the last step's sliver is still visible next to the first
		document.getElementById('qp-bar').style.width = Math.max(2, Math.log(step.ms + 1) / max * 100) + '%';
	}

	Array.prototype.forEach.call(buttons, function (b) {
		b.addEventListener('click', function () { show(Number(b.getAttribute('data-step'))); });
	});

	show(0);
})();

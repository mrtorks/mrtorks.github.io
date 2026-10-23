// "Try to break it": a small simulation of a load-balanced app tier and a
// primary/replica database. Clicking a node takes it down; a health check
// notices after a moment, routes around it, and the node restarts itself.
(function () {
	var demo = document.getElementById('failover-demo');
	if (!demo) return;

	var HEALTH_CHECK = 1200; // how long a dead node keeps getting traffic
	var RESTART = 6000;      // how long until a dead node starts restarting
	var BOOT = 1500;         // how long a restart takes

	var nodes = {};
	Array.prototype.forEach.call(demo.querySelectorAll('.fo-node'), function (el) {
		var name = el.getAttribute('data-node');
		nodes[name] = {
			el: el,
			db: name.indexOf('db') === 0,
			role: name === 'db-1' ? 'primary' : 'replica',
			state: 'up'
		};
		el.addEventListener('click', function () { kill(name); });
	});

	var apps = ['app-1', 'app-2', 'app-3'];
	var dbs = ['db-1', 'db-2'];
	var next = 0, served = 0, failed = 0;
	var log = document.getElementById('fo-log');

	function note(text) {
		var item = document.createElement('li');
		item.textContent = text;
		log.insertBefore(item, log.firstChild);
		while (log.children.length > 4) log.removeChild(log.lastChild);
	}

	function primary() {
		for (var i = 0; i < dbs.length; i++) if (nodes[dbs[i]].role === 'primary') return nodes[dbs[i]];
	}

	function render(name) {
		var node = nodes[name];
		var label = {
			up: node.db ? (node.role === 'primary' ? 'Primary' : 'Replica') : 'Serving',
			failing: 'Not responding',
			out: node.db ? 'Down' : 'Out of rotation',
			restarting: 'Restarting'
		}[node.state];
		node.el.className = 'fo-node is-' + node.state;
		node.el.querySelector('.fo-state').textContent = label;
	}

	function kill(name) {
		var node = nodes[name];
		if (node.state !== 'up') return;
		node.state = 'failing';
		render(name);
		note(name + ' stopped responding.');

		setTimeout(function () {
			node.state = 'out';
			render(name);
			if (!node.db) {
				note('Health check pulled ' + name + ' out of rotation.');
			} else if (node.role === 'primary') {
				var other = nodes[dbs[0] === name ? dbs[1] : dbs[0]];
				if (other.state === 'up') {
					node.role = 'replica';
					other.role = 'primary';
					render(other.el.getAttribute('data-node'));
					note(other.el.getAttribute('data-node') + ' promoted to primary.');
				} else {
					note('No healthy replica to promote. Writes are failing.');
				}
			}
		}, HEALTH_CHECK);

		setTimeout(function () {
			node.state = 'restarting';
			render(name);
			setTimeout(function () {
				node.state = 'up';
				if (node.db && primary().state !== 'up') {
					primary().role = 'replica';
					node.role = 'primary';
					dbs.forEach(render);
				}
				render(name);
				note(node.db ? name + ' rejoined as ' + node.role + '.' : name + ' back in rotation.');
			}, BOOT);
		}, RESTART);
	}

	function flash(node) {
		node.el.classList.add('is-hit');
		setTimeout(function () { node.el.classList.remove('is-hit'); }, 120);
	}

	// Round-robin one request across the app servers the load balancer still trusts
	function request() {
		var app;
		for (var i = 0; i < apps.length; i++) {
			var candidate = nodes[apps[(next + i) % apps.length]];
			if (candidate.state === 'up' || candidate.state === 'failing') {
				app = candidate;
				next = (next + i + 1) % apps.length;
				break;
			}
		}
		var db = primary();
		if (app && app.state === 'up' && db.state === 'up') {
			served++;
			flash(app);
			flash(db);
		} else {
			failed++;
		}
		document.getElementById('fo-served').textContent = served.toLocaleString();
		document.getElementById('fo-failed').textContent = failed.toLocaleString();
		document.getElementById('fo-rate').textContent = (served / (served + failed) * 100).toFixed(1) + '%';
	}

	// Only send traffic while the demo is on screen
	var timer = null;
	function run(on) {
		if (on && !timer) timer = setInterval(request, 150);
		if (!on && timer) { clearInterval(timer); timer = null; }
	}
	if (window.IntersectionObserver) {
		new IntersectionObserver(function (entries) { run(entries[0].isIntersecting); }).observe(demo);
	} else {
		run(true);
	}

	apps.concat(dbs).forEach(render);
})();

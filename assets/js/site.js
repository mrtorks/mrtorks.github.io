(function () {
	var root = document.documentElement;
	var toggle = document.getElementById('theme-toggle');
	var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

	function isDark() {
		var theme = root.getAttribute('data-theme');
		return theme ? theme === 'dark' : systemDark.matches;
	}

	function updateLabel() {
		toggle.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
	}

	if (toggle) {
		toggle.addEventListener('click', function () {
			var next = isDark() ? 'light' : 'dark';
			root.setAttribute('data-theme', next);
			try { localStorage.setItem('theme', next); } catch (e) {}
			updateLabel();
		});
		updateLabel();
	}

	var header = document.querySelector('.site-header');
	if (header) {
		var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
	}

	// Redraw the hero wave from weekly GitHub contribution totals (see data/activity.json)
	var tide = document.querySelector('.tide-line');
	var caption = document.getElementById('tide-caption');
	if (tide && caption && window.fetch) {
		fetch('data/activity.json')
			.then(function (res) { return res.ok ? res.json() : Promise.reject(); })
			.then(function (data) { drawTide(data.weeks); })
			.catch(function () {});
	}

	function drawTide(weeks) {
		if (!weeks || weeks.length < 2) return;
		var path = tide.querySelector('path');
		var marker = tide.querySelector('.tide-marker');
		var max = Math.max.apply(null, weeks.map(function (w) { return w.count; })) || 1;
		var step = 350 / (weeks.length - 1);
		// Square root keeps one huge week from flattening the rest of the year
		var points = weeks.map(function (w, i) {
			return [1 + i * step, 22 - 20 * Math.sqrt(w.count / max)];
		});

		// Catmull-Rom spline through the points, written as cubic Beziers
		var d = 'M' + points[0].join(' ');
		for (var i = 0; i < points.length - 1; i++) {
			var p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
			d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
				', ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
				', ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
		}
		path.setAttribute('d', d);

		var total = weeks.reduce(function (sum, w) { return sum + w.count; }, 0);
		var summary = total + ' GitHub contributions in the past year';
		var dateFormat = { month: 'short', day: 'numeric', year: 'numeric' };
		caption.textContent = summary;
		caption.hidden = false;

		tide.addEventListener('pointermove', function (e) {
			var box = tide.getBoundingClientRect();
			var x = (e.clientX - box.left) / box.width * 352;
			var i = Math.max(0, Math.min(weeks.length - 1, Math.round((x - 1) / step)));
			marker.setAttribute('cx', points[i][0]);
			marker.setAttribute('cy', points[i][1]);
			marker.hidden = false;
			var start = new Date(weeks[i].start + 'T00:00:00');
			caption.textContent = 'Week of ' + start.toLocaleDateString(undefined, dateFormat) + ' · ' +
				weeks[i].count + (weeks[i].count === 1 ? ' contribution' : ' contributions');
		});
		tide.addEventListener('pointerleave', function () {
			marker.hidden = true;
			caption.textContent = summary;
		});
	}

	var year = document.getElementById('currentYear');
	if (year) year.textContent = new Date().getFullYear();
})();

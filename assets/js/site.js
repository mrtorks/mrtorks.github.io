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

	var print = document.getElementById('resume-print');
	if (print) {
		print.hidden = false;
		print.addEventListener('click', function () { window.print(); });
	}

		var year = document.getElementById('currentYear');
	if (year) year.textContent = new Date().getFullYear();
})();

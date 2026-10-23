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

	// Add days online and the latest commit to the footer status line
	var status = document.getElementById('site-status');
	if (status && window.fetch) {
		fetch('https://api.github.com/repos/mrtorks/mrtorks.github.io/commits/main')
			.then(function (res) { return res.ok ? res.json() : Promise.reject(); })
			.then(function (commit) {
				var day = 86400000;
				var up = Math.floor((Date.now() - Date.UTC(2021, 7, 9)) / day);
				var ago = Math.floor((Date.now() - new Date(commit.commit.committer.date)) / day);
				var link = document.createElement('a');
				link.href = commit.html_url;
				link.textContent = commit.sha.slice(0, 7);
				status.lastChild.textContent = 'Up ' + up.toLocaleString() + ' days · last deployed ' +
					(ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago') + ' · commit ';
				status.appendChild(link);
			})
			.catch(function () {});
	}

	var year = document.getElementById('currentYear');
	if (year) year.textContent = new Date().getFullYear();
})();

// Command palette: ⌘K (or Ctrl+K) opens a searchable list of places to go
// and things to do on the site.
(function () {
	var dialog = document.getElementById('palette');
	if (!dialog || !dialog.showModal) return;

	var input = document.getElementById('palette-input');
	var list = document.getElementById('palette-list');
	var opener = document.getElementById('palette-open');
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform);

	function go(id) { return function () { document.getElementById(id).scrollIntoView(); }; }
	function open(url) { return function () { location.href = url; }; }
	function demo(tab) {
		return function () {
			document.getElementById(tab).click();
			document.getElementById('lab').scrollIntoView();
		};
	}

	var commands = [
		{ label: 'Selected work', group: 'Section', run: go('work') },
		{ label: 'Break it: failover demo', group: 'Demo', run: demo('tab-break') },
		{ label: 'Tune it: query demo', group: 'Demo', run: demo('tab-tune') },
		{ label: 'Migrate it: migration demo', group: 'Demo', run: demo('tab-migrate') },
		{ label: 'About', group: 'Section', run: go('about') },
		{ label: 'Contact', group: 'Section', run: go('contact') },
		{ label: 'Résumé', group: 'Page', run: open('resume.html') },
		{ label: 'Working with me', group: 'Page', run: open('working-with-me.html') },
		{ label: 'Copy email address', group: 'Action', keepOpen: true, run: function (item) {
			navigator.clipboard.writeText('jtorkornoo@gmail.com').then(function () {
				item.firstChild.textContent = 'Copied jtorkornoo@gmail.com';
			});
		} },
		{ label: 'Switch theme', group: 'Action', keepOpen: true, run: function () { document.getElementById('theme-toggle').click(); } },
		{ label: 'GitHub', group: 'Link', run: open('https://github.com/mrtorks') },
		{ label: 'LinkedIn', group: 'Link', run: open('https://www.linkedin.com/in/mrtorks/') }
	];

	var shown = [], active = 0;

	function render() {
		var query = input.value.trim().toLowerCase();
		shown = commands.filter(function (c) { return (c.label + ' ' + c.group).toLowerCase().indexOf(query) !== -1; });
		active = Math.min(active, Math.max(shown.length - 1, 0));
		list.innerHTML = '';
		shown.forEach(function (command, i) {
			var item = document.createElement('li');
			item.id = 'palette-item-' + i;
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', i === active);
			item.innerHTML = '<span></span><span></span>';
			item.firstChild.textContent = command.label;
			item.lastChild.textContent = command.group;
			item.addEventListener('mousemove', function () { if (active !== i) { active = i; highlight(); } });
			item.addEventListener('click', function () { choose(i); });
			list.appendChild(item);
		});
		if (!shown.length) list.innerHTML = '<li class="palette-empty">No matches</li>';
		highlight();
	}

	function highlight() {
		Array.prototype.forEach.call(list.children, function (item, i) {
			if (item.getAttribute('role') === 'option') item.setAttribute('aria-selected', i === active);
		});
		var current = document.getElementById('palette-item-' + active);
		if (current) {
			input.setAttribute('aria-activedescendant', current.id);
			current.scrollIntoView({ block: 'nearest' });
		} else {
			input.removeAttribute('aria-activedescendant');
		}
	}

	function choose(i) {
		var command = shown[i];
		if (!command) return;
		if (!command.keepOpen) dialog.close();
		command.run(document.getElementById('palette-item-' + i));
	}

	function show() {
		if (dialog.open) return;
		input.value = '';
		active = 0;
		render();
		dialog.showModal();
		input.focus();
	}

	document.addEventListener('keydown', function (e) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			dialog.open ? dialog.close() : show();
		}
	});

	input.addEventListener('input', function () { active = 0; render(); });
	input.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			var step = e.key === 'ArrowDown' ? 1 : -1;
			if (shown.length) active = (active + step + shown.length) % shown.length;
			highlight();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(active);
		}
	});

	// Clicking the dimmed backdrop (the dialog element itself) closes it
	dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

	if (opener) {
		opener.querySelector('kbd').textContent = isMac ? '⌘K' : 'Ctrl K';
		opener.hidden = false;
		opener.addEventListener('click', show);
	}
})();

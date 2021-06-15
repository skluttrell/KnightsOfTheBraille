const { app, Menu, BrowserWindow, globalShortcut, dialog, ipcMain } = require('electron');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

function loadFile(filename=null) {
			const window = BrowserWindow.getFocusedWindow();

	if (!filename) {
		const options = {
			title: 'Select a character',
			filters: [
				{ name: 'Character files', extensions: [ 'cha' ]}
			]
		};
		const files = dialog.showOpenDialogSync(window, options);
		if (files) {
			filename = files[0];
		}
	}
	if (filename) {
		window.send('load_character', filename);
	}
}

function saveFile(startDir='') {
	const window = BrowserWindow.getFocusedWindow();
	const zip = new AdmZip();

	const options = {
		title: 'Save new character as',
		defaultPath: startDir,
		filters: [
			{ name: 'Character files', extensions: [ 'cha' ]}
		]
	};
	const filename = dialog.showSaveDialogSync(window, options);

	if (filename) {
		zip.addFile(`${path.parse(filename).name}.dat`, Buffer.alloc(0, '')); // Create an empty character file in the archive
		zip.addFile('log.txt', Buffer.alloc(0, '')); // Create the log file in the character archive
		zip.writeZip(filename); // Store the archive on disc
		return filename; // Send the new file name back to the save request
	}
	return;
}

app.on('ready', () => {
	globalShortcut.register('CommandOrControl+S', () => {
		// Send message to the renderer to request a frame id
		BrowserWindow.getFocusedWindow().send('who_am_i');
	});

	globalShortcut.register('CommandOrControl+O', () => {
		loadFile();
	});
});

ipcMain.on('load_character', (event, arg) => {
	loadFile(arg);
});

ipcMain.on('save_character', (event, arg) => {
	// Need to know the exact length of a string and special characters seem to cause it to be misreported
	function lengthUtf8(str) {
		// Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
		// https://stackoverflow.com/questions/5515869/string-length-in-bytes-in-javascript
		let m = encodeURIComponent(str).match(/%[89ABab]/g);
		return str.length + (m ? m.length : 0);
	}
	const window = BrowserWindow.getFocusedWindow();

	if (typeof arg === 'object') { // Just save the information
		const zip = new AdmZip(arg.file);
		characterFile = arg.file.split('\\').pop().split('.')[0] + '.dat';
		// Known issue where updateFile can currupt the file in the archive
		// Adding content to Existing Archive corrupts data#378 opened on May 3 by tylertownsend
		//zip.updateFile(characterFile, Buffer.alloc(lengthUtf8(arg.info), arg.info));
		//zip.updateFile('log.txt', Buffer.alloc(lengthUtf8(arg.log), arg.log));
		zip.deleteFile(`${path.parse(arg.file).name}.dat`)
		zip.addFile(`${path.parse(arg.file).name}.dat`, Buffer.alloc(lengthUtf8(arg.info), arg.info));
		zip.deleteFile('log.txt');
		zip.addFile('log.txt', Buffer.alloc(lengthUtf8(arg.log), arg.log));
		zip.writeZip();
	} else { // This is a new character request
		const pattern = String(/^\*\[.+\]\*$/.exec(arg));
		if (pattern) {
				const filename = saveFile(app.getPath('documents')); // Request a save location

			if (filename) { // Load the new character sheet
				window.send('load_character', { file: filename, ruleset: pattern.substring(2, pattern.length - 2) });
			}
		}
	}
});

ipcMain.on('save_request', (event, arg) => {
	BrowserWindow.getFocusedWindow().webContents.sendToFrame(arg, 'save_request');
});

ipcMain.on('request_recent_files_list', (event, arg) => {
	BrowserWindow.getFocusedWindow().webContents.send('request_recent_files_list', event.frameId);
});

ipcMain.on('here_is_the_recent_files_list', (event, arg) => {
	BrowserWindow.getFocusedWindow().webContents.sendToFrame(arg.id, 'here_is_the_recent_files_list', arg.list);
});

ipcMain.on('request_sheet_list', (event, arg) => { // Synchronous return
	event.returnValue = sheetList;
});

// Set up the menubar

const template = [
	{
		label: 'File',
		submenu: [
			{
				label: 'New',
				submenu: []
			},
			{
				label: 'Open',
				accelerator: 'CommandOrControl+O',
				click() {
					loadFile();
				}
			},
			{
				label: 'Save',
				accelerator: 'CommandOrControl+S',
				click() {
					BrowserWindow.getFocusedWindow().send('who_am_i');
				}
			},
			{
				label: "Recent Files",
				role: 'recentdocuments',
				submenu: [
					{ label: 'Clear All', role: 'clearrecentdocuments' }
				]
			},
			{ role: 'quit' }
		]
	},
	{
		label: 'Network',
		submenu: [
			{
				label: 'Join',
				accelerator: 'CommandOrControl+J'
			},
			{
				label: 'Start Server',
				accelerator: 'CommandOrControl+H'
			},
			{
				label: 'Settings',
				accelerator: 'CommandOrControl+P'
			}
		]
	},
	{
		role: 'help',
		submenu: [
			{
				label: 'About'
			}
		]
	}
];

const sheetList = [];
let charTemplates = fs.readdirSync(path.join(__dirname, 'Templates'));
for (let v of charTemplates) {
	let content = JSON.parse(fs.readFileSync(path.join(__dirname, 'Templates', v, 'info.json')));
	template[0].submenu[0].submenu.push({ label: content.name });
	sheetList.push({ name: content.name, type: `*[${v}]*` });
}

if (process.env.DEBUG) {
	template.push({
		label: 'Debug',
		submenu: [
			{ label: 'Dev Tools', role: 'toggleDevTools' },
			{ type: 'separator' },
			{ role: 'Reload', accelerator: 'Alt+R' }
		]
	});
}

if (process.platform === 'darwin') {
	template.unshift({
		label: app.name,
		submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }]
	});
}

const menu = Menu.buildFromTemplate(template);
module.exports = menu;
# Hana Vault

A design prototype of the HANA vault: a 3D map with a glossy black core in the middle and each node's files orbiting around it. Import a file and it gets pulled into the core like a black hole. Click a file and the core opens and spits it out as a 3D card you can read.

Everything runs in your browser. There is no server, no account and no install.

## Run it on your computer

You need a browser (Chrome or Edge recommended) and either Python or Node. Most computers already have one of them.

1. Get the files. Either click the green **Code** button on GitHub and choose **Download ZIP**, then unzip it, or run:

   ```
   git clone https://github.com/DANTHAND005/hana-vault.git
   ```

2. Open a terminal in the `hana-vault` folder.

   - Windows: open the folder in File Explorer, click the address bar, type `cmd` and press Enter.
   - Mac: right-click the folder and choose **New Terminal at Folder**.

3. Start a small local web server with one of these:

   ```
   python -m http.server 4173
   ```

   On Windows, if that says Python was not found, use `py -m http.server 4173`. If you have Node instead:

   ```
   npx serve -l 4173
   ```

4. Open **http://127.0.0.1:4173** in your browser.

To stop it, press Ctrl+C in the terminal.

Opening `index.html` by double-clicking will not work properly. The PDF viewer and file storage need the page to be served from a web address.

## Using it

- **Add files:** use the Add files button, the plus in the Ask HANA bar, or drag files onto the map. PDF, Excel, CSV, images and text files can be viewed. Word and PowerPoint files are stored but only offer a download.
- **Open a file:** click a file dot on the map. Use the arrows or the left and right keys for PDF pages and Excel sheets, and Esc to close.
- **Edit or delete a file:** open it, then use Edit (text and CSV files only) or Delete in the bar at the bottom.
- **New files:** your latest upload pulses on the map, and its node shows a `+N` badge.
- **Vaults:** use the dropdown in the top left to switch, add or rename vaults (the pencil). Scroll all the way out on the map to see every vault and click one to enter it.
- **Ask HANA:** type or tap the mic and ask for a project name or document type. It searches your files by keyword. No AI model is connected yet. Voice works in Chrome and Edge only and needs internet.
- **Orbit and zoom:** drag to orbit, scroll to zoom.

## Your data

Files and layout are saved in your own browser on your own computer. Nothing is uploaded anywhere, and other people who open the site cannot see your files.

To wipe everything you added, click the trash icon at the bottom of the sidebar, or open `http://127.0.0.1:4173/?reset=1`.

## Put it online

It is a static site, so any free static host works. For GitHub Pages: open the repo's **Settings**, then **Pages**, set the source to the `main` branch and the root folder, and save. The site appears at `https://DANTHAND005.github.io/hana-vault/`. Each visitor still gets their own empty vault stored in their own browser.

## Checks

With Node installed, these run the model and layout checks:

```
node checks/self-check.cjs
node checks/scale-check.cjs
node checks/routing-check.cjs
node checks/motion-check.cjs
```

## What is in the folder

- `index.html`, `style.css`: the page and the matte black styling
- `app.js`: vaults, nodes, the 3D map, the black hole animation, Ask HANA, importing
- `viewer.js`: the 3D file viewer
- `vendor/`: PDF.js and SheetJS, included so the site works offline
- `checks/`: the test scripts

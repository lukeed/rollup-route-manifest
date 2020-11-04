import rsort from 'route-sort';

function toAsset(str) {
	if (/\.js$/i.test(str)) return 'script';
	if (/\.(svg|jpe?g|png|webp)$/i.test(str)) return 'image';
	if (/\.(woff2?|otf|ttf|eot)$/i.test(str)) return 'font';
	if (/\.css$/i.test(str)) return 'style';
	return false;
}

function toLink(assets, _pattern, _filemap) {
	let value = '';
	assets.forEach(obj => {
		if (value) value += ', ';
		value += `<${obj.href}>; rel=preload; as=${obj.type}`;
		if (/^(font|script)$/.test(obj.type)) value += '; crossorigin=anonymous';
	});
	return [{ key: 'Link', value }];
}

function toFunction(val) {
	if (typeof val === 'function') return val;
	if (typeof val === 'object') return key => val[key];
}

export default function (opts={}) {
	const { routes, assets, headers, minify, merge, inline, format } = opts;
	const { filename='rmanifest.json', sort=true, publicPath='/' } = opts;

	if (!routes) {
		throw new Error('A "routes" mapping is required');
	}

	const toRoute = toFunction(routes);
	const toHeaders = toFunction(headers) || headers === true && toLink;
	const toFormat = typeof format === 'function' && format;
	const toType = toFunction(assets) || toAsset;

	return {
		name: 'rollup-route-manifest',
		generateBundle(_, bundle) {
			const Pages = new Map;
			const Manifest = {};
			const Files = {};

			let mainEntry, fid;
			let key, tmp, route;

			const write = (data) => {
				if (inline && mainEntry) {
					// NOTE: Does NOT invalidate hash -- too late
					mainEntry.code = `window.__rmanifest=${JSON.stringify(data)};` + mainEntry.code;
				}

				if (filename) {
					this.emitFile({
						type: 'asset',
						fileName: filename,
						source: JSON.stringify(data, null, minify ? 0 : 2)
					});
				}
			}

			for (key in bundle) {
				if (!/\.js$/.test(key)) continue;

				tmp = bundle[key];

				if (tmp.isEntry) {
					mainEntry = tmp;
				}

				fid = tmp.facadeModuleId;
				route = fid && toRoute(fid);
				if (!route) continue;

				let prev = Pages.get(route) || [];

				let list = new Set([
					...prev, key, ...tmp.imports,
					...tmp.referencedFiles
				]);

				Pages.set(route, list);
			}

			if (merge && Pages.has('*')) {
				tmp = Pages.get('*');

				Pages.forEach((list, route) => {
					if (route === '*') return;
					for (let x of tmp) list.add(x);
				});

				Pages.delete('*');
			}

			// Filenames -> Objects
			Pages.forEach((list, route) => {
				let tmp = Files[route] = Files[route] || [];

				// TODO: Add priority hints?
				// Iterate, possibly filtering out
				list.forEach(filename => {
					let type = toType(filename);
					let href = publicPath + filename;
					if (type) tmp.push({ type, href });
				});
			});

			// All patterns
			const routes = Object.keys(Files);
			if (sort) rsort(routes);

			if (toFormat) {
				for (key in Files) {
					tmp = toFormat(Files[key]);
					if (tmp) Files[key] = tmp;
				}
			}

			// No headers? Then stop here
			if (!toHeaders) {
				if (!sort) return write(Files); // order didn't matter
				return write(routes.reduce((o, key) => (o[key]=Files[key], o), {}));
			}

			// Otherwise compute "headers" per pattern
			// And save existing Files as "files" key
			routes.forEach(pattern => {
				const files = Files[pattern];
				const headers = toHeaders(files, pattern, Files) || [];
				Manifest[pattern] = { files, headers };
			});

			write(Manifest);
		}
	};
}

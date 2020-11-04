import { suite } from 'uvu';
import { klona } from 'klona/json';
import * as assert from 'uvu/assert';
import plugin from '../src';

import BUNDLE from './fixtures/bundle.json';
import * as EXPECT from './fixtures/expects';

function bundle(options) {
	const emits = [];
	const assets = klona(BUNDLE);
	plugin(options).generateBundle.apply({
		emitFile: obj => emits.push(obj)
	}, [null, assets]);
	return { emits, assets };
}

function combine(files, headers) {
	let k, output = {};
	for (k in files) {
		output[k] = { files: files[k] };
	}
	for (k in headers) {
		output[k].headers = headers[k];
	}
	return output;
}

function parse(arr, isMini = false) {
	assert.is(arr.length, 1, '~> emits 1 file');

	const [rmanifest] = arr;

	assert.is(rmanifest.fileName, 'rmanifest.json');
	assert.is(rmanifest.source.startsWith('{\n  '), !isMini);
	return JSON.parse(rmanifest.source);
}

const DEFAULTS = {
	routes(file) {
		// note: file would be absolute irl
		if (!file.includes('src/routes')) return '*';
		let name = file.replace('src/routes', '').replace('.js', '');
		if (name === '/article') return '/:slug';
		return name === '/home' ? '/' : name;
	}
};

const API = suite('exports');

API('should be a function', () => {
	assert.type(plugin, 'function');
});

API('should return a plugin', () => {
	const output = plugin({ routes: true });
	assert.type(output.generateBundle, 'function');
	assert.type(output.name, 'string');
});

API.run();

// ---

const filename = suite('options.filename');

filename('should be "rmanifest.json" by default', () => {
	const { emits } = bundle({
		routes: () => false,
	});

	assert.is(emits.length, 1, '~> emits 1 file');

	const [rmanifest] = emits;
	assert.is(rmanifest.fileName, 'rmanifest.json');
});

filename('should be customizable', () => {
	const { emits } = bundle({
		routes: () => false,
		filename: 'hello.json',
	});

	assert.is(emits.length, 1, '~> emits 1 file');

	const [rmanifest] = emits;
	assert.is(rmanifest.fileName, 'hello.json');
});

filename('should not emit a file if falsey', () => {
	const { emits } = bundle({
		routes: () => false,
		filename: '',
	});

	assert.is(emits.length, 0, '~> emits 0 files');
});

filename.run();

// ---

const minify = suite('options.minify');

minify('should not be minified by default', () => {
	const { emits } = bundle({
		routes: () => '/'
	});

	assert.ok(
		emits[0].source.startsWith('{\n  '),
	);
});

minify('should minify if `minify: true` specified', () => {
	const { emits } = bundle({
		routes: () => '/',
		minify: true,
	});

	assert.not.ok(
		emits[0].source.startsWith('{\n  '),
	);
});

minify.run();

// ---

const routes = suite('options.routes');

routes('should throw if `routes` option is missing', () => {
	try {
		plugin();
		assert.unreachable();
	} catch (err) {
		assert.instance(err, Error);
		assert.is(err.message, 'A "routes" mapping is required');
	}
});

routes('should accept `routes` object', () => {
	assert.not.throws(() => {
		plugin({
			routes: {}
		})
	});
});

routes('should accept `routes` function', () => {
	assert.not.throws(() => {
		plugin({
			routes() {
				//
			}
		})
	});
});

routes('should return `false` to ignore route (function)', () => {
	const { emits } = bundle({
		routes(file) {
			return !file.includes('error.js') && DEFAULTS.routes(file);
		}
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.is(routes.includes('/error'), false, '~> omits "/error" route');
	assert.equal(routes, ['/', '/search', '/:slug', '*']);

	const expects = klona(EXPECT.FILES);
	delete expects['/error'];

	assert.equal(contents, expects);
});

routes('should return `false` to ignore route (object)', () => {
	const { emits } = bundle({
		routes: {
			// note: would be absolute
			'src/index.js': '*',
			'src/routes/home.js': '/',
			'src/routes/article.js': '/:slug',
			'src/routes/search.js': '/search',
			// 'src/routes/error.js': false
		}
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.is(routes.includes('/error'), false, '~> omits "/error" route');
	assert.equal(routes, ['/', '/search', '/:slug', '*']);

	const expects = klona(EXPECT.FILES);
	delete expects['/error'];

	assert.equal(contents, expects);
});

routes('should skip sorting when `sort: false`', () => {
	const { emits } = bundle({
		routes: DEFAULTS.routes,
		sort: false,
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['*', '/error', '/', '/search', '/:slug']);

	assert.equal(contents,
		routes.reduce((obj, key) => {
			obj[key] = EXPECT.FILES[key];
			return obj;
		}, {})
	);
});

routes.run();

// ---

const headers = suite('options.headers');

headers('should create `Link` headers when `true` value', () => {
	const { emits } = bundle({
		headers: true,
		routes: DEFAULTS.routes,
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/error', '/', '/search', '/:slug', '*']);

	const example = contents['/'];
	assert.equal(Object.keys(example), ['files', 'headers']);
	assert.instance(example.headers, Array);
	assert.instance(example.files, Array);

	const expects = combine(EXPECT.FILES, EXPECT.HEADERS);
	assert.equal(contents, expects);
});

headers('should accept custom function', () => {
	const { emits } = bundle({
		routes: DEFAULTS.routes,
		headers(assets, pattern, filemap) {
			return filemap['*'].concat(assets);
		}
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/error', '/', '/search', '/:slug', '*']);

	const example = contents['/'];
	assert.equal(Object.keys(example), ['files', 'headers']);
	assert.instance(example.headers, Array);
	assert.instance(example.files, Array);

	assert.equal(contents, {
		'/error': {
			files: EXPECT.FILES['/error'],
			headers: [
				...EXPECT.FILES['*'],
				...EXPECT.FILES['/error'],
			]
		},
		'/': {
			files: EXPECT.FILES['/'],
			headers: [
				...EXPECT.FILES['*'],
				...EXPECT.FILES['/'],
			]
		},
		'/search': {
			files: EXPECT.FILES['/search'],
			headers: [
				...EXPECT.FILES['*'],
				...EXPECT.FILES['/search'],
			]
		},
		'/:slug': {
			files: EXPECT.FILES['/:slug'],
			headers: [
				...EXPECT.FILES['*'],
				...EXPECT.FILES['/:slug'],
			]
		},
		'*': {
			files: EXPECT.FILES['*'],
			headers: [
				...EXPECT.FILES['*'],
				...EXPECT.FILES['*'],
			]
		},
	});
});

headers('should ensure Array if custom function returns nothing', () => {
	const { emits } = bundle({
		routes: DEFAULTS.routes,
		headers: () => false
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/error', '/', '/search', '/:slug', '*']);

	const example = contents['/'];
	assert.equal(Object.keys(example), ['files', 'headers']);
	assert.instance(example.headers, Array);
	assert.instance(example.files, Array);

	const expects = combine(EXPECT.FILES,
		routes.reduce((obj, key) => {
			obj[key] = [];
			return obj;
		}, {})
	);

	assert.equal(contents, expects);
});

headers.run();

// ---

const assets = suite('options.assets');

assets('should accept function to customize preload types', () => {
	const { emits } = bundle({
		routes: DEFAULTS.routes,
		headers: true,
		assets(str) {
			if (/\.js$/.test(str)) return 'x-script';
			if (/\.css$/.test(str)) return 'x-style';
			if (/\.ttf$/.test(str)) return 'x-font';
			return false; // images
		}
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/error', '/', '/search', '/:slug', '*']);

	let i=0, isType = /(^x-|as=["']?x-)(script|style|font)/;

	for (let key in contents) {
		let { files, headers } = contents[key];
		for (; i < files.length; i++) {
			assert.match(files[i].type, isType);
		}
		for (i=0; i < headers.length; i++) {
			assert.match(headers[i].value, isType);
			assert.not.match(headers[i].value, 'as=image');
		}
	}
});

assets.run();

// ---

const publicPath = suite('options.publicPath');

publicPath('should be "/" by default', () => {
	const { emits } = bundle({
		routes: () => '/search',
		headers: true,
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/search']);

	const { files, headers } = contents['/search'];

	for (let i=0; i < files.length; i++) {
		assert.match(files[i].href, /^[/]/);
	}

	for (let i=0, j=0, tmp; i < headers.length; i++) {
		tmp = headers[i].value.split(/,\s+?/g);
		for (j=0; j < tmp.length; j++) {
			assert.match(tmp[j], /^<[/]/);
		}
	}
});

publicPath('should be configurable', () => {
	const { emits } = bundle({
		routes: () => '/search',
		publicPath: '/assets/',
		headers: true,
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/search']);

	const { files, headers } = contents['/search'];

	for (let i=0; i < files.length; i++) {
		assert.match(files[i].href, /^[/]assets[/]/);
	}

	for (let i=0, j=0, tmp; i < headers.length; i++) {
		tmp = headers[i].value.split(/,\s+?/g);
		for (j=0; j < tmp.length; j++) {
			assert.match(tmp[j], /^<[/]assets[/]/);
		}
	}
});

publicPath.run();

// ---

const format = suite('options.format');

format('should customize `Asset` data before write', () => {
	const { emits } = bundle({
		format: files => files.map(x => x.href),
		routes: x => x.includes('/search') && '/search',
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/search']);

	assert.instance(contents['/search'], Array);

	assert.equal(
		contents['/search'],
		EXPECT.FILES['/search'].map(x => x.href)
	);
});

format('may produce broken "headers" with `headers: true` option', () => {
	const { emits } = bundle({
		headers: true,
		format: files => files.map(x => x.href),
		routes: x => x.includes('/search') && '/search',
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/search']);

	const { files, headers } = contents['/search'];
	assert.instance(headers, Array);
	assert.instance(files, Array);

	assert.equal(
		contents['/search'].files,
		EXPECT.FILES['/search'].map(x => x.href)
	);

	assert.match(
		contents['/search'].headers[0].value,
		'<undefined>; rel=preload; as=undefined,'
	);
});

format('passes modified `Asset[]` list to `headers` function', () => {
	const { emits } = bundle({
		format: files => files.map(x => x.href),
		routes: x => x.includes('/search') && '/search',
		headers: assets => assets
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/search']);

	const { files, headers } = contents['/search'];
	assert.instance(headers, Array);
	assert.instance(files, Array);

	assert.equal(
		contents['/search'].files,
		contents['/search'].headers,
	);

	assert.equal(
		contents['/search'].headers,
		EXPECT.FILES['/search'].map(x => x.href)
	);
});

format.run();

// ---

const inline = suite('options.inline');

inline('should not inline "rmanifest" data by default', () => {
	const { emits, assets } = bundle({
		routes: x => x.includes('/search') && '/search',
	});

	assert.is(emits.length, 1, '~> emits 1 file');

	const entry = assets['index.1c5aebde.js'];
	assert.is(entry.code, `console.log('ello')`, '~> unchanged');
	assert.ok(entry.isEntry, '~> unchanged');
});

inline('should inline "rmanifest" data into main entry', () => {
	const { emits, assets } = bundle({
		inline: true,
		routes: x => x.includes('/search') && '/search',
		minify: true,
	});

	// emits 1 file, minified
	const contents = parse(emits, true);

	const entry = assets['index.1c5aebde.js'];
	assert.is(entry.code, `window.__rmanifest=${JSON.stringify(contents)};console.log('ello')`);
});

inline('should only avoid "rmanifest.json" via falsey `filename` option', () => {
	const { emits, assets } = bundle({
		inline: true,
		filename: false,
		routes: x => x.includes('/search') && '/search',
	});

	assert.is(emits.length, 0, '~> emits 0 files')

	const entry = assets['index.1c5aebde.js'];
	assert.ok(entry.code.startsWith(`window.__rmanifest={"`));
});

inline.run();

// ---

const merge = suite('options.merge');

merge('should combine route contents with "*" contents', () => {
	const { emits } = bundle({
		merge: true,
		routes: DEFAULTS.routes,
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.not.ok(routes.includes('*'), '~> removed "*" key');
	assert.equal(routes, ['/error', '/', '/search', '/:slug']);

	assert.instance(contents['/'], Array);

	function squash(key) {
		let i=0, arr=EXPECT.FILES[key].slice();
		let owned = new Set(arr.map(x => x.href));
		let shared = EXPECT.FILES['*'].slice();
		for (; i < shared.length; i++) {
			if (owned.has(shared[i].href)) continue;
			owned.add(shared[i].href);
			arr.push(shared[i]);
		}
		return arr;
	}

	assert.equal(contents['/'], squash('/'));
	assert.equal(contents['/search'], squash('/search'));
	assert.equal(contents['/:slug'], squash('/:slug'));
});

merge('should combine route contents with "*" contents :: headers', () => {
	const { emits } = bundle({
		merge: true,
		headers: true,
		routes: DEFAULTS.routes,
	});

	const contents = parse(emits);
	const routes = Object.keys(contents);
	assert.not.ok(routes.includes('*'), '~> removed "*" key');
	assert.equal(routes, ['/error', '/', '/search', '/:slug']);

	const commons = new Set(EXPECT.FILES['*'].map(x => x.href));

	for (let key in contents) {
		contents[key].headers.forEach(obj => {
			for (let asset of commons) {
				assert.match(obj.value, '<' + asset);
			}
		});
	}
});

merge.run();

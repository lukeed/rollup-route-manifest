import { suite } from 'uvu';
import { klona } from 'klona/json';
import * as assert from 'uvu/assert';
import plugin from '../src';

import BUNDLE from './fixtures/bundle.json';
import * as EXPECT from './fixtures/expects';

function bundle(options) {
	const files = [];
	plugin(options).generateBundle.apply({
		emitFile: obj => files.push(obj)
	}, [null, klona(BUNDLE)]);
	return files;
}

function merge(files, headers) {
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
	const output = bundle({
		routes: () => false,
	});

	assert.is(output.length, 1, '~> emits 1 file');

	const [rmanifest] = output;
	assert.is(rmanifest.fileName, 'rmanifest.json');
});

filename('should be customizable', () => {
	const output = bundle({
		routes: () => false,
		filename: 'hello.json',
	});

	assert.is(output.length, 1, '~> emits 1 file');

	const [rmanifest] = output;
	assert.is(rmanifest.fileName, 'hello.json');
});

filename.run();

// ---

const minify = suite('options.minify');

minify('should not be minified by default', () => {
	const [rmanifest] = bundle({
		routes: () => '/'
	});

	assert.ok(
		rmanifest.source.startsWith('{\n  '),
	);
});

minify('should minify if `minify: true` specified', () => {
	const [rmanifest] = bundle({
		routes: () => '/',
		minify: true,
	});

	assert.not.ok(
		rmanifest.source.startsWith('{\n  '),
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
	const output = bundle({
		routes(file) {
			return !file.includes('error.js') && DEFAULTS.routes(file);
		}
	});

	const contents = parse(output);
	const routes = Object.keys(contents);
	assert.is(routes.includes('/error'), false, '~> omits "/error" route');
	assert.equal(routes, ['/', '/search', '/:slug', '*']);

	const expects = klona(EXPECT.FILES);
	delete expects['/error'];

	assert.equal(contents, expects);
});

routes('should return `false` to ignore route (object)', () => {
	const output = bundle({
		routes: {
			// note: would be absolute
			'src/index.js': '*',
			'src/routes/home.js': '/',
			'src/routes/article.js': '/:slug',
			'src/routes/search.js': '/search',
			// 'src/routes/error.js': false
		}
	});

	const contents = parse(output);
	const routes = Object.keys(contents);
	assert.is(routes.includes('/error'), false, '~> omits "/error" route');
	assert.equal(routes, ['/', '/search', '/:slug', '*']);

	const expects = klona(EXPECT.FILES);
	delete expects['/error'];

	assert.equal(contents, expects);
});

routes('should skip sorting when `sort: false`', () => {
	const output = bundle({
		routes: DEFAULTS.routes,
		sort: false,
	});

	const contents = parse(output);
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
	const output = bundle({
		headers: true,
		routes: DEFAULTS.routes,
	});

	const contents = parse(output);
	const routes = Object.keys(contents);
	assert.equal(routes, ['/error', '/', '/search', '/:slug', '*']);

	const example = contents['/'];
	assert.equal(Object.keys(example), ['files', 'headers']);
	assert.instance(example.headers, Array);
	assert.instance(example.files, Array);

	const expects = merge(EXPECT.FILES, EXPECT.HEADERS);
	assert.equal(contents, expects);
});

headers('should accept custom function', () => {
	const output = bundle({
		routes: DEFAULTS.routes,
		headers(assets, pattern, filemap) {
			return filemap['*'].concat(assets);
		}
	});

	const contents = parse(output);
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

headers.run();

// ---

const assets = suite('options.assets');

assets('should accept function to customize preload types', () => {
	const output = bundle({
		routes: DEFAULTS.routes,
		headers: true,
		assets(str) {
			if (/\.js$/.test(str)) return 'x-script';
			if (/\.css$/.test(str)) return 'x-style';
			if (/\.ttf$/.test(str)) return 'x-font';
			return false; // images
		}
	});

	const contents = parse(output);
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
	const output = bundle({
		routes: () => '/search',
		headers: true,
	});

	const contents = parse(output);
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
	const output = bundle({
		routes: () => '/search',
		publicPath: '/assets/',
		headers: true,
	});

	const contents = parse(output);
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

// TODO: inline
// TODO: merge

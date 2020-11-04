# rollup-route-manifest [![CI](https://github.com/lukeed/rollup-route-manifest/workflows/CI/badge.svg)](https://github.com/lukeed/rollup-route-manifest/actions) [![codecov](https://badgen.net/codecov/c/github/lukeed/rollup-route-manifest)](https://codecov.io/gh/lukeed/rollup-route-manifest)

> A Rollup plugin to generate an asset manifest, keyed by route patterns!

***The Context***

Modern applications (should!) take advantage of route-based code splitting. This enables an application to be compartmentalized into smaller pieces, and to only load those pieces when needed. The common/immediate benefit is that your clients' first page-load requires dramatically less code, which results in a faster experience.

***The Problem***

While amazing, this isn't (yet) a perfect solution. The client will need to navigate to other pages!

Let's assume the client checks out the `/blog` page. <br>
In most configurations, the blog's assets only start downloading **after** the click has been made. Typically, the main "entrypoint" for `/blog` will load, but _only then_ will the additional assets it requires be requested. This cascade of "oh yeah, we need that too" can easily get out of hand.

What this means is that despite our super speedy, well-optimized application, the client is still waiting for assets. Our application is at the mercy of the client's network connection.

Until all the assets for `/blog` have loaded, our client may be staring at a loading screen/spinner, or – worse – a split-second flash of the loader.

***The Solution***

With this plugin, you regain control of your application's assets and how they're loaded. :muscle:

You are given the knowledge of exactly which files are _going to be requested_ for each route of your application.

In turn, this means you can preemptively load _all_ the assets for `/blog` _before_ the client clicks – or begin prefetching _everything_ `/blog` needs immediately after the click – skipping the "oh yeah"-cascade and decreasing wait time(s).

***Further Reading***

* https://developer.mozilla.org/en-US/docs/Web/HTML/Preloading_content
* https://www.smashingmagazine.com/2016/02/preload-what-is-it-good-for/
* https://w3c.github.io/preload/#x2.link-type-preload


## Install

```
$ npm install rollup-route-manifest --save-dev
```


## Usage

```js
// rollup.config.js
import Manifest from 'rollup-route-manifest';

export default {
  // ...
  plugins: [
    // ...
    Manifest({
      merge: true,
      minify: true,
      routes(file) {
        // Assume all "routes" in "/path/to/src/pages/" directory
        file = file.replace('/path/to/src', '').replace(/\.[tj]sx?$/, '');
        if (!file.includes('/pages/') return '*'; // commons

        let name = '/' + file.replace('/pages/', '');
        if (name === '/error') return false; // ignore

        if (name === '/article') return '/blog/:title';
        return name === '/home' ? '/' : name;
      }
    })
  ]
}
```

## Options

#### options.routes
Type: `Function` or `Object`<br>
Required: `true`

Map absolute file paths to the URL route patterns that represent them.

> **Important:** This is the **only** required option.

When `routes` is a function, it receives absolute paths (`string`) and expects a pattern (string) to be returned. You may return a falsey value to ignore the file, which _will not_ create a new key in the route manifest.

```js
route(file) {
  if (file.includes('/error.js')) return false; // skip
  if (!file.includes('/routes/')) return '*'; // commons chunk
  let name = file.replace('/path/to/routes/', '').replace(/\.[tj]sx?$/, '');
  if (name === 'article') return '/blog/:slug';
  return name === 'home' ? '/' : name;
}
```

When `routes` is an object, its keys must match the abolsute path and its values must be the pattern strings. Any unmatched absolute paths are ignored – as are any falsey values. Ignored files _will not_ create a new key in the route manifest.

```js
routes: {
  '/path/to/src/index.js': '*',
  '/path/to/routes/home.js': '/',
  '/path/to/routes/article.js': '/blog/:slug',
  // falsey and/or no match ~> ignore
  // '/path/to/routes/error.js': false
}
```


#### options.assets
Type: `Function` or `Object`

Customize the `type` or `as` value of an asset by looking at its filename.

> **Important:** You may also return a falsey value to exclude the asset from the manifest.

The `assets` option receives the assets' filenames, which are used to return a valid [resource "destination"](https://fetch.spec.whatwg.org/#concept-request-destination) value. You may also return a falsey value which will _not include_ the asset inside the manifest.

Below is the default `assets` parser:

```js
assets(filename) {
  if (/\.js$/i.test(filename)) return 'script';
  if (/\.(svg|jpe?g|png)$/i.test(filename)) return 'image';
  if (/\.(woff2?|otf|ttf|eot)$/i.test(filename)) return 'font';
  if (/\.css$/i.test(filename)) return 'style';
  return false;
}
```

When `assets` is an object, the assets' filenames are used as key lookups. Unmatched filenames are ignored and not included in the manifest. Because this could get _very_ verbose, the `function`-based approach is strongly recommended.


#### options.format
Type: `Function`

Customize the `Asset` values.

You may use this function to modify the contents of the route chunks' `Asset` list. This also runs before the `headers` are produced.

> **Important:** The `assets` and `filemap` your `options.headers` function receives are affected by any `options.format` changes.

For example, if we wanted to drop the `type` information from our `Asset` list:

```js
format(assets) {
  return assets.map(x => x.href);
}
```


#### options.headers
Type: `true` or `Function`

Optionally include (and customize) a "headers" section per manifest entry.

> **Important:** When enabled, the output format of your manifest file will change! See [Manifest Contents](#manifest-contents) for details.

When `true`, the default/internal function is used, which produces a [HTTP `Link` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Link) per pattern, pointing to the pattern's assets.

You may also provide a function to define your own `Link` header and/or add additional headers per route.<br>
This function will receive:

* `assets` – the `Asset[]` files for the current route chunk
* `pattern` – the current [route pattern](#route-patterns) string
* `filemap` – the entire manifest file mapping (`{ [pattern]: Asset[] }`)

> **Note:** An `Asset` is defined as `{ type: string, href: string }` shape.


#### options.filename
Type: `String` or `false`<br>
Default: `rmanifest.json`

The output filename for the route manifest. <br>
This file is written to disk, relative to your Rollup configuration's output directory/file.

When a falsey value (eg, `''`, `false`, `null`), no file is emitted.


#### options.publicPath
Type: `String`<br>
Default: `'/'`

A prefix to append to all `Asset` paths. This affects all files and headers, when enabled.

> **Important:** A `publicPath` must end with a trailing slash.

```js
// rollup.config.js
Manifest({
  inline: true,
  publicPath: '/foobar/'
  // ...
})

// in browser:
console.log(window.__rmanifest['/']);
//=> [
//=>   { type: 'script', href: '/foobar/index.b0b86791.js' },
//=>   { type: 'script', href: '/foobar/index.1c5aebde.js' },
//=>   ...
//=> ]
```


#### options.merge
Type: `Boolean`<br>
Default: `false`

When enabled, and when a `"*"` chunk exists, the `"*"` contents are merged into all other route chunks.

> **Note:** Any headers are merged too, if/when `options.headers` is enabled.

After merging, the `"*"` chunk is **removed** from the final manifest. This is because its contents are already accounted for, reducing the amount of `route-manifest` (runtime) work.


#### options.minify
Type: `Boolean`<br>
Default: `false`

Minify the manifest's file contents.


#### options.sort
Type: `Boolean`<br>
Default: `true`

If route patterns should be sorted by specificity. By default, this is `true` as to ensure the consumer/runtime (eg, [`route-manifest`](https://github.com/lukeed/route-manifest)) can find the correct entry for a URL path.

> **Note:** See [Specificity](https://github.com/lukeed/route-sort#specificity) from `route-sort` documentation.


#### options.inline
Type: `Boolean`<br>
Default: `true`

Attempts to inline the manifest file directly into your main entry file (eg; `bundle.xxxxx.js`).<br>When successful, the manifest will be available globally as `window.__rmanifest`.

While not required, it is strongly recommended that this option remains enabled so that the manifest contents are available to your Application _immediately_ upon loading. This saves a network request and the trouble of coordinating subsequent prefetches.

> **Note:** A `rmanifest.json` will still be written to disk for easier developer analysis. You must define a falsey `option.filename` to prevent a disk write.


## Route Patterns

The supported route pattern types are:

* static – `/users`
* named parameters – `/users/:id`
* nested parameters – `/users/:id/books/:title`
* optional parameters – `/users/:id?/books/:title?`
* suffixed parameters – `/movies/:title.mp4`, `/movies/:title.(mp4|mov)`
* wildcards – `/users/*`


## Manifest Contents

The manifest file contains a JSON object whose keys are the [route patterns](#route-patterns) you've defined for your application via the [`options.routes`](#optionsroutes) mapping.

> **Note:** There will often be a `"*"` key, which signifies your common/catch-all route.<br>
This typically contains your `bundle.(js|css)` files, and maybe some images that your main stylesheet requires.

Each key will point to an "Entry" item whose data type will vary depending on your [`options.headers`](#optionsheaders) configuration. Either way, this Entry will always contain an "Asset" array, so let's define that first:

```ts
interface Asset {
  type: string;
  href: string;
}
```

Now, _without_ `options.headers` (default), the manifest pairs patterns directly to its list of Assets:

```ts
type Entry = Asset[];
// keys are `[pattern: string]`
type Manifest = Record<string, Entry>;

// Example:
//=> {
//=>   "/": [
//=>     { "type": "script", "href": "/index.abc123.js" },
//=>     { "type": "style", "href": "/index.d10eg4.css" },
//=>     // ...
//=>   ],
//=>   "/:slug": [...]
//=> }
```

With `options.headers` configured, each manifest Entry becomes object containing "files" and "headers" keys:

```ts
interface Entry {
  files: Asset[];
  headers: any[]; // you decide its shape
}

// keys are `[pattern: string]`
type Manifest = Record<string, Entry>;

// Example:
//=> {
//=>   "/": {
//=>     "files": [
//=>       { "type": "script", "href": "/index.abc123.js" },
//=>       { "type": "style", "href": "/index.d10eg4.css" },
//=>       // ...
//=>     ],
//=>     "headers": [
//=>       // you decide
//=>     ]
//=>   }
//=>   "/:slug": [...]
//=> }
```

Lastly, if `options.headers` is `true`, the default function runs, providing you with this format:

```ts
interface Header {
  key: string;
  value: string;
}

interface Entry {
  files: Asset[];
  headers: Header[];
}

// keys are `[pattern: string]`
type Manifest = Record<string, Entry>;

// Example:
//=> {
//=>   "/": {
//=>     "files": [
//=>       { "type": "script", "href": "/index.abc123.js" },
//=>       { "type": "style", "href": "/index.d10eg4.css" },
//=>       // ...
//=>     ],
//=>     "headers": [
//=>       {
//=>         "key": "Link",
//=>         "value": "</index.abc123.js>; rel=preload; as=script; crossorigin=anonymous, ..."
//=>       }
//=>     ]
//=>   }
//=>   "/:slug": [...]
//=> }
```

## Related

* [`webpack-route-manifest`](https://github.com/lukeed/webpack-route-manifest) – The webpack variant of this plugin.
* [`route-manifest`](https://github.com/lukeed/route-manifest) – A tiny (412B) runtime to retrieve the correct entry from a Route Manifest file.
* [`route-sort`](https://github.com/lukeed/route-sort) – A tiny (200B) utility to sort route patterns by specificity
* [`quicklink`](https://github.com/GoogleChromeLabs/quicklink) – A 900B library to achieve faster subsequent page-loads by prefetching in-viewport links during idle time.


## License

MIT © [Luke Edwards](https://lukeed.com)

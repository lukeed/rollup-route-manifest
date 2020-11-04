declare module 'rollup-route-manifest' {
	const { routes, assets, headers, format, minify, merge, inline } = opts;
	const { filename='rmanifest.json', sort=true, publicPath='/' } = opts;

	type Pattern = string;
	type Dict<T> = Record<string, T>;
	type Filter<T> = T | false | void | null;

	type FileMap = Record<Pattern, Asset[]>;

	export interface Header {
		key: string;
		value: string | string[];
	}

	export interface Asset {
		type: string;
		href: string;
	}

	export interface Options {
		routes: Dict<Pattern> | ((input: string) => Filter<Pattern>);
		assets?: Dict<string> | ((filepath: string) => Filter<string>);
		headers?: true | ((files: Asset[], pattern: Pattern, filemap: FileMap) => Header[]);
		/** @default '/' */
		publicPath?: string;
		/** @default false */
		minify?: boolean;
		/** @default 'rmanifest.json' */
		filename?: string;
		/** @default false */
		inline?: boolean;
		/** @default false */
		merge?: boolean;
		/** @default true */
		sort?: boolean;
	}

	export default function (options: Options): import('rollup').Plugin;
}

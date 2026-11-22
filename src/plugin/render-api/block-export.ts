import { App } from "obsidian";

interface BlockExportOutput {
	html: string;
	css: { id: string; text: string };
	variables: Record<string, string | null>;
}

type BlockExportResult = { ok: true; value: BlockExportOutput } | { ok: false; error: string };

interface BlockExportProvider {
	apiVersion: number;
	languages: string[];
	exportVersion: number;
	export(block: { language: string; source: string; sourcePath: string; width?: number }): Promise<BlockExportResult>;
}

// Plugins that publish `blockExport` (see rich-table's src/blockExportApi.ts) can render their own
// fenced blocks to static, measurement-free HTML. We look a provider up by fence language and fall
// back to whatever the generic renderer produced when none answers.
export namespace BlockExport
{
	const SUPPORTED_API_VERSION = 1;

	function findProviders(): { language: string; provider: BlockExportProvider }[]
	{
		const found: { language: string; provider: BlockExportProvider }[] = [];
		// @ts-ignore
		const plugins = (app as App).plugins?.plugins ?? {};
		for (const id of Object.keys(plugins))
		{
			const provider = plugins[id]?.blockExport as BlockExportProvider | undefined;
			if (!provider || provider.apiVersion !== SUPPORTED_API_VERSION || !Array.isArray(provider.languages)) continue;
			for (const language of provider.languages) found.push({ language: language.toLowerCase(), provider });
		}
		return found;
	}

	function blockLanguage(el: HTMLElement): string | undefined
	{
		const match = /(?:^|\s)block-language-(\S+)/.exec(el.className);
		return match?.[1]?.toLowerCase();
	}

	// Fenced blocks of `language` in the given lines, in document order. Each entry is what is
	// between the fences, with the fence's indent kept (the provider is told to accept that).
	function extractFences(lines: string[], language: string): string[]
	{
		const result: string[] = [];
		const open = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;
		for (let i = 0; i < lines.length; i++)
		{
			const m = open.exec(lines[i] ?? "");
			if (!m) continue;
			const fence = m[2] ?? "```";
			const info = (m[3] ?? "").toLowerCase();
			const closer = new RegExp(`^\\s*\\${fence.charAt(0)}{${fence.length},}\\s*$`);
			const body: string[] = [];
			let j = i + 1;
			for (; j < lines.length; j++)
			{
				const line = lines[j] ?? "";
				if (closer.test(line)) break;
				body.push(line);
			}
			if (info === language) result.push(body.join("\n"));
			i = j;
		}
		return result;
	}

	/**
	 * Replaces the blocks a provider can render with the provider's markup. `sectionEls` are the
	 * rendered sections in document order; a language is only replaced when the note text and the
	 * rendered document agree on how many blocks of it there are, because the blocks are paired by
	 * position. Anything that goes wrong leaves the generically rendered block as it was.
	 */
	export async function replaceInSections(
		sectionEls: HTMLElement[],
		noteText: string,
		sourcePath: string,
		width: number | undefined,
		styles: Map<string, { text: string; variables: Record<string, string | null> }>
	): Promise<void>
	{
		const providers = findProviders();
		if (providers.length === 0) return;

		const targets = sectionEls.flatMap(el => Array.from(el.querySelectorAll<HTMLElement>("[class*='block-language-']")));
		const noteLines = noteText.split(/\r?\n/);

		for (const entry of providers)
		{
			const rendered = targets.filter(t => blockLanguage(t) === entry.language);
			if (rendered.length === 0) continue;

			const sources = extractFences(noteLines, entry.language);
			if (sources.length !== rendered.length)
			{
				console.warn(`[block-export] "${entry.language}" skipped: ${sources.length} fence(s) in the note text but ${rendered.length} rendered block(s)`);
				continue;
			}

			for (let i = 0; i < rendered.length; i++)
			{
				const target = rendered[i];
				const source = sources[i];
				if (!target || source === undefined) continue;

				let result: BlockExportResult;
				try
				{
					result = await entry.provider.export({ language: entry.language, source, sourcePath, width });
				}
				catch (e)
				{
					console.warn(`blockExport for "${entry.language}" threw, keeping the generic output`, e);
					continue;
				}
				if (!result.ok)
				{
					console.warn(`blockExport for "${entry.language}" failed: ${result.error}`);
					continue;
				}

				const { html, css, variables } = result.value;
				if (!styles.has(css.id)) styles.set(css.id, { text: css.text, variables });
				target.innerHTML = html;
				target.setAttribute("data-block-export", css.id);
			}
		}
	}

	export function buildStyleElements(doc: Document, styles: Map<string, { text: string; variables: Record<string, string | null> }>): HTMLStyleElement[]
	{
		const elements: HTMLStyleElement[] = [];
		for (const [id, { text, variables }] of styles)
		{
			const defaults = Object.entries(variables)
				.filter(([, value]) => value !== null)
				.map(([name, value]) => `${name}:${value};`)
				.join("");
			const style = doc.createElement("style");
			style.id = `block-export-${id}`;
			// :where() keeps the defaults at zero specificity so any theme value for the same variable wins.
			style.textContent = `:where(:root){${defaults}}\n${text.replace(/<\/style>/gi, "")}`;
			elements.push(style);
		}
		return elements;
	}
}

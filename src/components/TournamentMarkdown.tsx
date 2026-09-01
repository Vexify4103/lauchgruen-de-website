import { Fragment, type ReactNode } from "react";

const INLINE_MARKDOWN = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(`([^`]+)`)|(\*([^*]+)\*)|(_([^_]+)_)/g;

function renderInline(value: string, keyPrefix: string): ReactNode[] {
	const content: ReactNode[] = [];
	const inlineMarkdown = new RegExp(INLINE_MARKDOWN.source, "g");
	let cursor = 0;
	let match: RegExpExecArray | null;

	while ((match = inlineMarkdown.exec(value)) !== null) {
		if (match.index > cursor) content.push(value.slice(cursor, match.index));

		const key = `${keyPrefix}-${match.index}`;
		if (match[1]) {
			content.push(
				<a
					key={key}
					href={match[3]}
					target="_blank"
					rel="noreferrer"
					className="font-black text-lime-200 underline decoration-lime-200/35 underline-offset-4 transition hover:text-lime-100"
				>
					{match[2]}
				</a>
			);
		} else if (match[4] || match[6]) {
			content.push(
				<strong key={key} className="font-black text-amber-50">
					{renderInline(match[5] ?? match[7] ?? "", `${key}-strong`)}
				</strong>
			);
		} else if (match[8]) {
			content.push(
				<del key={key} className="text-amber-100/48 decoration-rose-300/70">
					{renderInline(match[9] ?? "", `${key}-del`)}
				</del>
			);
		} else if (match[10]) {
			content.push(
				<code key={key} className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-100">
					{match[11]}
				</code>
			);
		} else {
			content.push(
				<em key={key} className="text-amber-100">
					{renderInline(match[13] ?? match[15] ?? "", `${key}-em`)}
				</em>
			);
		}

		cursor = match.index + match[0].length;
	}

	if (cursor < value.length) content.push(value.slice(cursor));
	return content;
}

function isBlockStart(line: string) {
	return /^(#{1,3})\s+/.test(line) || /^\s*[-+*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || /^>\s?/.test(line) || /^\s*(---+|___+|\*\*\*+)\s*$/.test(line);
}

function renderBlocks(markdown: string) {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const blocks: ReactNode[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index += 1;
			continue;
		}

		const heading = /^(#{1,3})\s+(.+)$/.exec(line);
		if (heading) {
			const level = heading[1].length;
			const content = renderInline(heading[2], `heading-${index}`);
			if (level === 1) {
				blocks.push(
					<h1 key={`heading-${index}`} className="mt-5 text-2xl font-black leading-tight text-amber-50 first:mt-0">
						{content}
					</h1>
				);
			} else if (level === 2) {
				blocks.push(
					<h2 key={`heading-${index}`} className="mt-5 text-xl font-black leading-snug text-amber-50 first:mt-0">
						{content}
					</h2>
				);
			} else {
				blocks.push(
					<h3 key={`heading-${index}`} className="mt-4 text-base font-black leading-snug text-amber-100 first:mt-0">
						{content}
					</h3>
				);
			}
			index += 1;
			continue;
		}

		if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
			blocks.push(<hr key={`hr-${index}`} className="my-5 border-0 border-t border-amber-100/14" />);
			index += 1;
			continue;
		}

		if (/^\s*[-+*]\s+/.test(line)) {
			const items: ReactNode[] = [];
			const blockIndex = index;
			while (index < lines.length) {
				const item = /^\s*[-+*]\s+(.*)$/.exec(lines[index]);
				if (!item) break;
				items.push(
					<li key={`ul-${index}`} className="pl-1">
						{renderInline(item[1], `ul-${index}`)}
					</li>
				);
				index += 1;
			}
			blocks.push(
				<ul key={`ul-block-${blockIndex}`} className="mt-3 list-disc space-y-1.5 pl-5 text-sm font-semibold leading-6 text-amber-50/84 marker:text-lime-200">
					{items}
				</ul>
			);
			continue;
		}

		if (/^\s*\d+\.\s+/.test(line)) {
			const items: ReactNode[] = [];
			const blockIndex = index;
			while (index < lines.length) {
				const item = /^\s*\d+\.\s+(.*)$/.exec(lines[index]);
				if (!item) break;
				items.push(
					<li key={`ol-${index}`} className="pl-1">
						{renderInline(item[1], `ol-${index}`)}
					</li>
				);
				index += 1;
			}
			blocks.push(
				<ol
					key={`ol-block-${blockIndex}`}
					className="mt-3 list-decimal space-y-1.5 pl-5 text-sm font-semibold leading-6 text-amber-50/84 marker:font-black marker:text-lime-200"
				>
					{items}
				</ol>
			);
			continue;
		}

		if (/^>\s?/.test(line)) {
			const quote: string[] = [];
			const blockIndex = index;
			while (index < lines.length && /^>\s?/.test(lines[index])) {
				quote.push(lines[index].replace(/^>\s?/, ""));
				index += 1;
			}
			blocks.push(
				<blockquote key={`quote-${blockIndex}`} className="mt-3 border-l-2 border-cyan-200/45 pl-4 text-sm font-semibold leading-6 text-amber-50/72">
					{renderInline(quote.join(" "), `quote-${blockIndex}`)}
				</blockquote>
			);
			continue;
		}

		const paragraph: string[] = [line.trim()];
		const blockIndex = index;
		index += 1;
		while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
			paragraph.push(lines[index].trim());
			index += 1;
		}
		blocks.push(
			<p key={`paragraph-${blockIndex}`} className="mt-3 text-sm font-semibold leading-6 text-amber-50/84 first:mt-0">
				{paragraph.map((part, partIndex) => (
					<Fragment key={`paragraph-${blockIndex}-${partIndex}`}>
						{partIndex > 0 ? <br /> : null}
						{renderInline(part, `paragraph-${blockIndex}-${partIndex}`)}
					</Fragment>
				))}
			</p>
		);
	}

	return blocks;
}

export function TournamentMarkdown({ children, className = "" }: { children: string; className?: string }) {
	return <div className={`min-w-0 [overflow-wrap:anywhere] ${className}`}>{renderBlocks(children)}</div>;
}

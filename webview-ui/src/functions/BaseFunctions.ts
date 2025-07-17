import MarkdownIt from 'markdown-it';
import MarkdownItMathjax from 'markdown-it-mathjax';
import markdownItContainer from 'markdown-it-container';
import hljs from 'highlight.js';

export const throttle = (func: Function, limit: number) => {
    let lastFunc: ReturnType<typeof setTimeout>;
    let lastRan: number;
    return function(this: any, ...args: any[]) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if (Date.now() - lastRan >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    }
};

const replaceOutsideCode = (source: string, pattern: RegExp) => {
    const codeBlockRegex = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
    let lastIndex = 0;
    let result = '';
    const stack: string[] = [];
    const maxDepth = 3;
    
    const replacer = (tag: string) => {
        const isClose = tag.startsWith('</');
        const tagName = isClose ? tag.slice(2, -1) : tag.slice(1, -1);
        if (isClose) {
            if (stack.length > 0 && stack[stack.length - 1] === tagName) {
                const depth = maxDepth - stack.length + 3;
                const tips = ":".repeat(depth);
                stack.pop();
                return `\n${tips}\n`; // 正确闭合标签
            } else {
                return tag; // 不匹配则保留原标签
            }
        } else {
            stack.push(tagName);
            const depth = maxDepth - stack.length + 3;
            const tips = ":".repeat(depth);
            return `\n${tips} ${tagName}\n`; // 开启新标签
        }
    };
    const processSegment = (segment: string) => {
        return segment.replace(pattern, replacer);
    };
    source.replace(codeBlockRegex, (match, offset) => {
        const segment = source.slice(lastIndex, offset);
        result += processSegment(segment);
        result += match;
        lastIndex = offset + match.length;
        return match;
    });
    const finalSegment = source.slice(lastIndex);
    result += processSegment(finalSegment);
    while (stack.length > 0) {
        const depth = maxDepth - stack.length + 3;
        const tips = ":".repeat(depth);
        result += `\n${tips}\n`;
        stack.pop();
    }
    return result;
};

export const md2html = (content: string) => {
    let text = String(content);
    text = text.replace(/<\|tips_start\|>[\s\S]*?<\|tips_end\|>/g, '');
    const codeStyleBegin = `<pre class="hljs"><code>`;
    const codeStyleEnd = `</code></pre>`;
    let md = MarkdownIt({
        html: true,
        breaks: true,
        highlight: function (str: string, lang: string) {
            let highlightedText = '';
            try{
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        highlightedText = codeStyleBegin + hljs.highlight(str, {language: lang, ignoreIllegals:true}).value + codeStyleEnd;
                    } catch (ex) {
                        highlightedText = codeStyleBegin + md.utils.escapeHtml(str) + codeStyleEnd;
                    }
                } else {
                    if (lang) {
                        highlightedText = codeStyleBegin + hljs.highlightAuto(str).value + codeStyleEnd;
                    } else {
                        const isLikelyCommand = !lang && /^\s*(pip|npm|yarn|apt|brew|git|sudo|chmod|curl|wget|docker)/.test(str.trim());
                        if (isLikelyCommand) {
                            lang = 'shell';
                            highlightedText = codeStyleBegin + hljs.highlight(str, {language: lang, ignoreIllegals: true}).value + codeStyleEnd;
                        } else {
                            highlightedText = codeStyleBegin + hljs.highlightAuto(str).value + codeStyleEnd;
                        }
                    }
                }
            } catch (e) {
                highlightedText = codeStyleBegin + md.utils.escapeHtml(str) + codeStyleEnd;
            } finally { 
                const codeWithStyle = `${highlightedText}`;
                const toolbar = `
                    <div class="code-toolbar">
                        <div class="language">${lang || 'plaintext'}</div>
                        <button class="copy-code-button" title="复制代码">复制</button>
                    </div>
                    `;
                return `<div class="code-block-wrapper">${toolbar}${codeWithStyle}</div>`;
            }
        }
    });
    const createContainer = (name: string, renderFn: (depth: number) => string) => {
        md.use(markdownItContainer, name, {
            validate: (params: string) => params.trim() === name,
            render: (tokens: any[], idx: number) => {
                const depth = tokens[idx].nesting;
                return renderFn(depth);
            }
        });
    };
    createContainer('ToolCalls', (depth) => {
        return depth === 1 
            ? `<div class="tools-block expanded">
                    <div class="block-header">
                        <button class="icon-button content-header">
                            <img class="expand-icon" src=""/>
                            <div class="content-header-content">工具调用详情</div>
                        </button>
                    </div>`
            : `</div>`;
    });
    createContainer('ToolCall', (depth) => {
        return depth === 1 
            ? `<div class="tool-block">`
            : `</div>`;
    });
    createContainer('ToolCallId', (depth) => {
        return depth === 1 
            ? `<div class="block-header">
                    <button class="icon-button content-header">
                        <img class="expand-icon" src=""/>
                        <div class="content-header-content">`
            : `</div></button></div>`;
    });
    createContainer('ToolCallInput', (depth) => {
        return depth === 1 
            ? `<div class="json-wrapper expanded">`
            : `</div>`;
    });
    createContainer('ToolCallOutput', (depth) => {
        return depth === 1 
            ? `<div class="json-wrapper expanded">`
            : `</div>`;
    });
    createContainer('think', (depth) => {
        return depth === 1 
            ? `<div class="result-block expanded">
                    <div class="block-header">
                        <button class="icon-button content-header">
                            <img class="expand-icon" src=""/>
                            <div class="content-header-content">思考过程</div>
                        </button>
                    </div>
                    <div class="content-wrapper">
                        <div class="think-content">`
            : `</div></div></div>`;
    });
    createContainer('conclusion', (depth) => {
        return depth === 1 
            ? `<div class="result-block expanded">
                    <div class="block-header">
                        <button class="icon-button content-header">
                            <img class="expand-icon" src=""/>
                            <div class="content-header-content">结论</div>
                        </button>
                    </div>
                    <div class="content-wrapper">
                        <div class="conclusion-content">` 
            : '</div></div></div>';
    });
    md.use(MarkdownItMathjax());

    text = replaceOutsideCode(text, /<\/?(ToolCalls|ToolCall|ToolCallId|ToolCallInput|ToolCallOutput|think|conclusion)>/g);

    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/(\S)\n:::/g, '$1\n\n:::');
    text = text.replace(/:::\n(\S)/g, ':::\n\n$1');
    text = text.replace(/^(\s+)/gm, (match) => {
        return match.replace(/ /g, '\u00A0').replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');
    });
    // text = text.replace(/\n\n/g, '\n<br>\n');
    try {
        let html = md.render(text);
        html = html.replace(/<p>/g, '<p style="margin:0;">');
        return html;
    } catch (e) {
        console.error('Markdown渲染失败:', e);
        return text; // 降级返回原始文本
    }
    // text = text.replace(/<code>/g, '<pre class="code-block"><code>').replace(/<\/code>/g, '</code></pre>');
};
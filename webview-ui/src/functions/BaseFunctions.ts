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

export type RenderResult = {
  html: string;
  components: {
    type: string;       // 组件类型，如 'browser-list'
    data: any;          // 组件所需数据
    index: number;
  }[];
};

export const md2html = (content: string) => {
    const result = {
        html: '',
        components: []
    }
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
    const createContainer = (name: string, renderFn: (depth: number, tokens: any[], idx: number) => string) => {
        md.use(markdownItContainer, name, {
            validate: (params: string) => params.trim() === name,
            render: (tokens: any[], idx: number) => {
                const depth = tokens[idx].nesting;
                return renderFn(depth, tokens, idx);
            }
        });
    };
    createContainer('ToolCalls', (depth: number) => {
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
    createContainer('ToolCall', (depth: number) => {
        return depth === 1 
            ? `<div class="tool-block">`
            : `</div>`;
    });
    createContainer('ToolCallId', (depth: number) => {
        return depth === 1 
            ? `<div class="block-header">
                    <button class="icon-button content-header">
                        <img class="expand-icon" src=""/>
                        <div class="content-header-content">`
            : `</div></button></div>`;
    });
    createContainer('ToolCallInput', (depth: number) => {
        return depth === 1 
            ? `<div class="json-wrapper expanded">`
            : `</div>`;
    });
    createContainer('ToolCallOutput', (depth: number) => {
        return depth === 1 
            ? `<div class="output-wrapper expanded">`
            : `</div>`;
    });
    createContainer('think', (depth: number) => {
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
    createContainer('conclusion', (depth: number) => {
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
        html = processOutputContainers(result.components, html);
        html = html.replace(/<p>/g, '<p style="margin:0;">');
        result.html = html;
    } catch (e) {
        console.error('Markdown渲染失败:', e);
        result.html = text;
    } finally {
        return result;
    }
};

const processOutputContainers = (components: any[], html: string) => {
    let componentIndex = 0;
    const beginDiv = `<div class="output-wrapper expanded">`;
    const endDiv = `</div>`;
    const outputWrapperRegex = /<div class="output-wrapper expanded">([\s\S]*?)<\/div>/g;   
    return html.replace(outputWrapperRegex, (_match, content) => {
        const trimmedContent = content.trim();
        let containerHtml = '';
        try {
            const decodedContent = decodeHtmlEntities(trimmedContent);
            const jsonData = JSON.parse(decodedContent);
            if (Array.isArray(jsonData)) {
                for (const item of jsonData) {
                    if (item.showType === "browser_list") {
                        // const jsonStr = JSON.stringify(item.value)
                        //     .replace(/'/g, "\\'")
                        //     .replace(/"/g, '&quot;');
                        // containerHtml += `<component :is="'browser-list'" :isDark="isDark" :data='${jsonStr}'></component>`;
                        const id = `component-${componentIndex++}`;
                        components.push({
                            type: 'browser-list',
                            data: item.value,
                            index: components.length
                        });
                        containerHtml += `${beginDiv}<div id="${id}"></div>${endDiv}`;
                    } else {
                        containerHtml += `${beginDiv}<div class="json-content">${JSON.stringify(item.value, null, 2)}</div>${endDiv}`;
                    }
                }
            } else {
                containerHtml = `${beginDiv}<div class="json-content">${decodedContent}</div>${endDiv}`;
            }
        } catch (error) {
            console.error("JSON 解析失败", error);
            containerHtml = `${beginDiv}<div class="json-error">无效的 JSON 格式</div>${endDiv}`;
        } finally {
            containerHtml;
            return containerHtml;
        }
    });
};

const decodeHtmlEntities = (str: string) => {
    let decoded = str
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&#x(\w+);/g, (_, code) => 
            String.fromCharCode(parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code) => 
            String.fromCharCode(parseInt(code, 10)));

    decoded = decoded
        .replace(/<br\s*\/?>/gi, '\n')    // <br> → 换行
        .replace(/<\/p>/gi, '\n\n')       // </p> → 双换行（段落间距）
        .replace(/<p[^>]*>/gi, '')        // 移除<p>标签本身
        .replace(/[\u00A0]/g, ' ') 
    return decoded
};
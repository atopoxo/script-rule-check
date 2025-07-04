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

const replaceOutsideCode = (source: string, pattern: RegExp, replacement: string) => {
    const codeBlockRegex = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
    let lastIndex = 0;
    let result = '';
    
    source.replace(codeBlockRegex, (match, offset) => {
        result += source.slice(lastIndex, offset).replace(pattern, replacement);
        result += match;
        lastIndex = offset + match.length;
        return match;
    });
    result += source.slice(lastIndex).replace(pattern, replacement);
    return result;
};

export const md2html = (content: string, iconPath: string) => {
    let text = String(content)
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
    })
    .use(markdownItContainer, 'think', {
        validate: function(params: any) {
            return params.trim() === 'think'
        },
        render: function(tokens: any, idx: any) {
            return tokens[idx].nesting === 1 
                ? `<div class="think-block expanded">
                        <div class="think-header">
                            <button class="icon-button content-header">
                                <img class="think-icon" src="${iconPath}"/>
                                <div class="content-header-content">思考过程</div>
                            </button>
                        </div>
                        <div class="think-content-wrapper">`
                : `</div></div>`;
        }
    })
    .use(markdownItContainer, 'conclusion', {
        validate: function(params: any) {
            return params.trim() === 'conclusion'
        },
        render: function(tokens: any, idx: any) {
            return tokens[idx].nesting === 1 
                ? `<div class="conclusion-block">
                        <div class="conclusion-content-wrapper">` 
                : '</div></div>';
        }
    })
    .use(MarkdownItMathjax());
    text = replaceOutsideCode(text, /<think>/g, '::: think\n');
    text = replaceOutsideCode(text, /<\/think>/g, '\n:::\n');
    text = replaceOutsideCode(text, /<conclusion>/g, '::: conclusion\n');
    text = replaceOutsideCode(text, /<\/conclusion>/g, '\n:::\n');
    text = text.replace(/\r\n/g, '\n');
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

// const content2html = (content: string) => {
//     let escaped = content
//         .replace(/&/g, "&amp;")
//         .replace(/</g, "&lt;")
//         .replace(/>/g, "&gt;")
//         .replace(/"/g, "&quot;")
//         .replace(/'/g, "&#039;")
//     escaped = escaped.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
//     escaped = escaped.replace(/ /g, '&nbsp;').replace(/\t/g, '&emsp;');
//     escaped = escaped.replace(/\n/g, '<br>');
//     return escaped;
// }
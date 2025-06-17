<!-- MessageRenderer.vue -->
<template>
  <div class="text" v-html="htmlContent"></div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect } from 'vue';
import MarkdownIt from 'markdown-it';
import MarkdownItMathjax from 'markdown-it-mathjax';
import markdownItContainer from 'markdown-it-container';
import hljs from 'highlight.js';

export default defineComponent({
  props: {
    content: {
      type: String,
      required: true
    }
  },
  setup(props) {
    // const htmlContent = computed(() => md2html(props.content));
    const htmlContent = ref('');
    
    const md2html = (content: string) => {
		let text = String(content)
        text = text.replace(/<\|tips_start\|>[\s\S]*?<\|tips_end\|>/g, '');
        let md = MarkdownIt({
            html: true,
            highlight: function (str: string, lang: string) {
                try{
                    if (lang && hljs.getLanguage(lang)) {
                        try {
                            return '<pre class="hljs"><code>' +
                                hljs.highlight(str, {language: lang, ignoreIllegals:true}).value +
                                '</code></pre>';
                        } catch (ex) {
                            console.log(ex)
                        }
                    } else {
                        return hljs.highlightAuto(str).value;
                    }
                } catch (e) {
                    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
                }
            }
        })
        .use(markdownItContainer, 'think', {
            validate: function(params: any) {
                return params.trim() === 'think'
            },
            render: function(tokens: any, idx: any) {
                return tokens[idx].nesting === 1 
                    ? '<div class="think-block">\n' 
                    : '</div>\n';
            }
        })
        .use(markdownItContainer, 'conclusion', {
            validate: function(params: any) {
                return params.trim() === 'conclusion'
            },
            render: function(tokens: any, idx: any) {
                return tokens[idx].nesting === 1 
                    ? '<div class="conclusion-block">\n' 
                    : '</div>\n';
            }
        })
        .use(MarkdownItMathjax());
        text = text.replace(/<think>/g, '::: think\n').replace(/<\/think>/g, '\n:::\n');
        text = text.replace(/<conclusion>/g, '::: conclusion\n').replace(/<\/conclusion>/g, '\n:::\n');
        text = text.replace(/\r\n/g, '\n');
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

    watchEffect(() => {
      htmlContent.value = md2html(props.content);
    });

    return { htmlContent };
  }
});
</script>

<style scoped>
.text {
  backdrop-filter: blur(10px);
  /* white-space: pre-wrap; */
  word-wrap: break-word;
  word-break: normal;
}
</style>
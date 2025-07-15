import * as vscode from 'vscode';

declare global {
    namespace Intl {
        class Segmenter {
            constructor(locales?: string | string[], options?: { granularity: 'word' });
            segment(input: string): Iterable<{ segment: string; isWordLike: boolean }>;
        }
    }
}

export class TextSegmenter {
    private segmenter: any;
    private useIntlSegmenter: boolean;

    constructor() {
        this.useIntlSegmenter = this.isIntlSegmenterAvailable();
        
        if (this.useIntlSegmenter) {
            this.segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
        } else {
            vscode.window.showInformationMessage(
                '使用轻量级分词器处理多语言文本，建议升级到 Node.js 18+ 以获得更好的分词效果'
            );
            const TinySegmenter = require("tiny-segmenter");
            this.segmenter = new TinySegmenter();
        }
    }

    public segment(text: string): string[] {
        if (!text) {
            return [];
        }
        if (this.useIntlSegmenter) {
            return this.segmentWithIntl(text);
        } else {
            return this.segmentWithTiny(text);
        }
    }

    private isIntlSegmenterAvailable(): boolean {
        try {
            if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
                const testSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
                const testSegments = testSegmenter.segment('test');
                return typeof testSegments[Symbol.iterator] === 'function';
            }
        } catch (e) {
            return false;
        }
        return false;
    }

    private segmentWithIntl(text: string): string[] {
        try {
            const segments = this.segmenter.segment(text);
            const tokens: string[] = [];
            for (const { segment, isWordLike } of segments) {
                if (isWordLike) {
                    tokens.push(segment);
                }
            }
            return tokens;
        } catch (error) {
            return this.segmentWithTiny(text);
        }
    }

    private segmentWithTiny(text: string): string[] {
        return this.segmenter.segment(text)
            .filter((token: any) => token.trim().length > 0)
            .filter((token: any) => !/^[\s\p{P}]+$/u.test(token));
    }
}
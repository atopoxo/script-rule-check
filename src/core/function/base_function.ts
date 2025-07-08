const chardet = require('chardet');
import fs from 'fs';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
function singleton<T extends new (...args: any[]) => any>(cls: T): T {
    const instances = new Map<T, InstanceType<T>>();

    const Wrapper = class extends cls {
        constructor(...args: any[]) {
            if (instances.has(cls)) {
                throw new Error("Cannot create multiple instances of singleton");
            }
            super(...args);
            instances.set(cls, this as InstanceType<T>);
        }
    };
    (Wrapper as any).__wrapped__ = cls;
    (Wrapper as any).__name__ = cls.name;
    const handler: ProxyHandler<any> = {
        construct(target: any, args: any[], newTarget: any): object {
            if (!instances.has(cls)) {
                instances.set(cls, new Wrapper(...args));
            }
            return instances.get(cls)!;
        }
    };

    return new Proxy(Wrapper, handler) as T;
}

function get_class_instance(class_name: string, module?: any, config?: any): [any | null, any | null] {
    try {
        if (class_name !== "") {
            let clsWrapper = module?.[class_name] || (globalThis as any)[class_name];
            if (!clsWrapper) {
                throw new Error(`Class '${class_name}' not found`);
            }
            const originalClass = clsWrapper.__wrapped__ || clsWrapper;
            const instance = config ? new originalClass(config) : new originalClass();
            return [originalClass, instance];
        }
        return [null, null];
    } catch (ex) {
        throw new Error(`Class resolution failed: ${ex}`);
    }
}

function get_class_method(class_name: string, method_name: string, module?: any, config?: any): Function {
    try {
        if (class_name !== "") {
            const [cls, instance] = get_class_instance(class_name, module, config);
            if (!instance) throw new Error(`Instance of ${class_name} not created`);
            return (instance[method_name] as Function).bind(instance);
        } else {
            const method = module?.[method_name] || (globalThis as any)[method_name];
            if (typeof method !== 'function') {
                throw new Error(`Method/function '${method_name}' not found`);
            }
            return method;
        }
    } catch (ex) {
        throw new Error(`Method resolution failed: ${ex}`);
    }
}

export function getEncoding(buffer: Buffer): BufferEncoding {
    const encoding = chardet.detect(buffer) || 'gbk';
    return encoding;
}

export function getFileContent(filePath?: string, buffer?: any, encoding?: BufferEncoding, startPos?: number, endPos?: number): string {
    if (!buffer && filePath) {
        buffer = fs.readFileSync(filePath);
    }
    if (!encoding) {
        encoding = getEncoding(buffer);
    }
    let content = iconv.decode(buffer, encoding);
    if (startPos || endPos) {
        if (!startPos) {
            startPos = 0;
        }
        if (!endPos) {
            endPos = content.length;
        }
        content = content.substring(startPos, endPos);
    }
    return content;
}

export function getGlobalConfigValue<T>(section: string, key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(section);
    const globalValue = config.inspect<T>(key)?.globalValue;
    return globalValue !== undefined ? globalValue : defaultValue;
};

export async function setGlobalConfigValue(section: string, key: string, value: any) {
    const config = vscode.workspace.getConfiguration(section);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
}
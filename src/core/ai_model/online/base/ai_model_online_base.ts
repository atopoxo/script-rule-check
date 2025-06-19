import { AIModelBase } from '../../base/ai_model_base';

export class AIModelOnlineBase extends AIModelBase {
    constructor(config: any, helper: any) {
        super(config, helper);
        this.mode = "online";
    }

    public chatStream(signal: AbortSignal, data: any): AsyncGenerator<any, void, unknown> {
        const self = this;

        async function* generate(): AsyncGenerator<any, void, unknown> {
            try {
                yield* self.streamGeneratorFramework(signal, data);

            } catch (ex: any) {
                const error = ex instanceof Error ? ex.message : String(ex);
                console.error(error);
            }
        }

        return generate();
    }
}
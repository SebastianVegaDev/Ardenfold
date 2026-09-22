import { Module } from "@nestjs/common";

import { CorrelationInterceptor } from "./correlation.interceptor";

@Module({
    providers: [CorrelationInterceptor],
    exports: [CorrelationInterceptor],
})
export class ObservabilityModule {}

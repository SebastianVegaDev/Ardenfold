import { runWithCorrelationContext } from "@ardenfold/observability";

import {
    CallHandler,
    type ExecutionContext,
    Injectable,
    type NestInterceptor,
} from "@nestjs/common";

import type { FastifyRequest } from "fastify";
import { Observable } from "rxjs";

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();

        return new Observable((subscriber) => {
            runWithCorrelationContext({ correlationId: request.id }, () => {
                next.handle().subscribe(subscriber);
            });
        });
    }
}

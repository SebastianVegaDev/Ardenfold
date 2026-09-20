import { Controller, Get } from "@nestjs/common";

type HealthResponse = Readonly<{
    status: "ok";
    service: "api";
}>;

@Controller()
export class AppController {
    @Get("health")
    getHealth(): HealthResponse {
        return {
        status: "ok",
        service: "api",
        };
    }
}
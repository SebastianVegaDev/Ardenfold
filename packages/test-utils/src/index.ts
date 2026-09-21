export type MessageCollector = Readonly<{
    messages: readonly string[];
    write: (message: string) => void;
}>;

export function createMessageCollector(): MessageCollector {
    const messages: string[] = [];

    return {
        messages,
        write: (message: string): void => {
            messages.push(message);
        },
    };
}

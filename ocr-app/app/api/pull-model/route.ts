import { NextRequest } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();
    const { model } = await request.json();

    if (!model) {
        return new Response('Model name is required', { status: 400 });
    }

    const stream = new ReadableStream({
        async start(controller) {
            try {
                console.log(`Starting pull for model: ${model}`);

                const pullProcess = spawn('ollama', ['pull', model]);

                pullProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log('Pull stdout:', output);

                    // Parse progress if possible, or just send the raw message
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        status: 'pulling',
                        message: output.trim()
                    })}\n\n`));
                });

                pullProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    console.log('Pull stderr:', output);

                    // Ollama often sends progress to stderr
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        status: 'pulling',
                        message: output.trim()
                    })}\n\n`));
                });

                await new Promise((resolve, reject) => {
                    pullProcess.on('close', (code) => {
                        if (code === 0) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                status: 'complete',
                                message: 'Model installed successfully'
                            })}\n\n`));
                            resolve(null);
                        } else {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                status: 'error',
                                error: `Pull failed with code ${code}`
                            })}\n\n`));
                            reject(new Error(`Process exited with code ${code}`));
                        }
                    });

                    pullProcess.on('error', (err) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            status: 'error',
                            error: err.message
                        })}\n\n`));
                        reject(err);
                    });
                });

            } catch (error: any) {
                console.error('Pull error:', error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    status: 'error',
                    error: error.message
                })}\n\n`));
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

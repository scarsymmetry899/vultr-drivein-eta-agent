declare module "*clocks.js" {
  export function presentIsoClocks(text: string, timeZone?: string): string;
  export function serviceFootnote(
    health: {
      live_call_verified?: boolean;
      live_call_model?: string;
      inference_mode?: string;
    } | null,
  ): string;
}

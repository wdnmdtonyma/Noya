import type { AnyModel, StreamOptions } from "@earendil-works/pi-ai";
import type { ModelRuntime, ModelRuntimeAuthOverrides } from "@earendil-works/pi-coding-agent";

// Keep Pi's login, storage and refresh, but make this runtime's OpenAI route subscription-only.
export function useChatGPTSubscription(runtime: ModelRuntime): void {
  const provider = runtime.getProvider("openai");
  if (!provider?.auth.oauth) throw new Error("Pi 缺少 Sign in with ChatGPT 支持");
  runtime.registerNativeProvider({
    ...provider,
    auth: { oauth: provider.auth.oauth },
    stream: (model, context, options) => provider.stream(subscriptionModel(model), context, subscriptionOptions(options)),
    streamSimple: (model, context, options) => provider.streamSimple(subscriptionModel(model), context, subscriptionOptions(options)),
  });
  const getAuth = runtime.getAuth.bind(runtime);
  runtime.getAuth = async (model: string | AnyModel, options: ModelRuntimeAuthOverrides = {}) => {
    if ((typeof model === "string" ? model : model.provider) !== "openai") {
      return typeof model === "string" ? getAuth(model, options) : getAuth(model, options);
    }
    const credentials = await runtime.listCredentials({ signal: options.signal });
    if (!credentials.some((credential) => credential.providerId === "openai" && credential.type === "oauth")) {
      throw new Error("Noya 通过 Pi 使用 ChatGPT 订阅，请先运行 /login openai 完成 Sign in with ChatGPT");
    }
    const { apiKey, env: _env, ...oauthOptions } = options;
    const result = typeof model === "string"
      ? await getAuth(model, oauthOptions)
      : await getAuth(model, oauthOptions);
    if (result?.source !== "OAuth" || !result.auth.apiKey) throw new Error("ChatGPT 订阅授权不可用，请运行 /login openai 重新登录");
    if (apiKey !== undefined && apiKey !== result.auth.apiKey) throw new Error("OpenAI 路径仅使用当前运行时的 ChatGPT 订阅凭证");
    return { source: result.source, auth: { apiKey: result.auth.apiKey } };
  };
}

function subscriptionModel<T extends AnyModel>(model: T): T {
  return { ...model, baseUrl: "https://api.openai.com/v1", headers: undefined };
}

function subscriptionOptions<T extends StreamOptions>(options?: T): T {
  return {
    ...options,
    headers: undefined,
    // Pi 1.0.0 handles subscription field omission and history conversion already.
    onPayload: async (payload, model) => {
      const transformed = await options?.onPayload?.(payload, model) ?? payload;
      const request = transformed as { tools?: Array<{ type: string }> };
      const tools = request.tools ?? [];
      const localTools = tools.filter((tool) => tool.type === "function" || tool.type === "custom");
      if (localTools.length === 0) return transformed;
      return {
        ...request,
        tools: [
          ...tools.filter((tool) => tool.type !== "function" && tool.type !== "custom"),
          { type: "namespace", name: "noya", description: "Noya 的本地工具", tools: localTools },
        ],
      };
    },
    onProviderStreamEvent: async (event, model) => {
      const data = event as { type?: string; response?: { incomplete_details?: { reason?: string } } };
      if (data.type === "response.incomplete") {
        throw new Error(`Response incomplete: ${data.response?.incomplete_details?.reason ?? "unknown"}`);
      }
      await options?.onProviderStreamEvent?.(event, model);
    },
  } as T;
}

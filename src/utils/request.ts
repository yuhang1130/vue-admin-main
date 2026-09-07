import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import qs from "qs";

import { ApiCodeEnum } from "@/enums/api";
import { useUserStoreHook } from "@/stores/user";
import { usePermissionStoreHook } from "@/stores/permission";
import { AuthStorage, redirectToLogin } from "@/utils/auth";
import type { ApiResult } from "@/api/common";

type ErrorPayload = Partial<ApiResult> & {
  message?: string;
  request_id?: string;
};

// 防止同一请求在 token 刷新后重复进入重试，导致死循环
const retriedRequests = new WeakSet<InternalAxiosRequestConfig>();

function readErrorPayload(value: unknown): ErrorPayload {
  return typeof value === "object" && value !== null ? (value as ErrorPayload) : {};
}

function errorMessage(payload: ErrorPayload, fallback: string): string {
  const message = payload.msg || payload.message || fallback;
  const requestId = payload.requestId || payload.request_id;
  return requestId ? `${message}（请求ID：${requestId}）` : message;
}

const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 50000,
  headers: { "Content-Type": "application/json;charset=utf-8" },
  // 数组参数序列化为 ids=1&ids=2，而非 ids[]=1&ids[]=2
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: "repeat" }),
});

http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = AuthStorage.getAccessToken();

    // 约定：调用方设置 Authorization 为 "no-auth" 即跳过 token 注入
    if (config.headers.Authorization === "no-auth") {
      delete config.headers.Authorization;
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response: AxiosResponse<ApiResult>): AxiosResponse | any => {
    const { responseType } = response.config;

    // 二进制数据直接透传
    if (responseType === "blob" || responseType === "arraybuffer") {
      return response;
    }

    const result = response.data;
    if (!result || typeof result !== "object" || typeof result.code !== "string") {
      const message = "接口响应格式错误";
      ElMessage.error(message);
      return Promise.reject(new Error(message));
    }

    const { code, data, msg } = result;

    if (code === ApiCodeEnum.SUCCESS) {
      return data;
    }

    const message = errorMessage(result, msg || "系统出错");
    ElMessage.error(message);
    return Promise.reject(new Error(message));
  },

  async (error) => {
    const { config, response } = error;

    if (!response) {
      ElMessage.error("网络连接失败");
      return Promise.reject(error);
    }

    const payload = readErrorPayload(response.data);
    const { code } = payload;

    // Token 过期
    if (code === ApiCodeEnum.ACCESS_TOKEN_INVALID) {
      if (!config || retriedRequests.has(config)) {
        await redirectToLogin("登录已过期，请重新登录");
        return Promise.reject(new Error("Token Invalid"));
      }

      retriedRequests.add(config);

      try {
        const userStore = useUserStoreHook();
        await userStore.refreshTokenOnce();

        const token = AuthStorage.getAccessToken();
        if (token) {
          config.headers.set("Authorization", `Bearer ${token}`);
        }

        return http(config);
      } catch {
        await redirectToLogin("登录已过期，请重新登录");
        return Promise.reject(new Error("Token refresh failed"));
      }
    }

    // Refresh token 失效
    if (code === ApiCodeEnum.REFRESH_TOKEN_INVALID) {
      await redirectToLogin("登录已过期，请重新登录", false);
      return Promise.reject(new Error("Token Invalid"));
    }

    // 权限不足
    if (code === ApiCodeEnum.PERMISSION_DENIED) {
      const permissionStore = usePermissionStoreHook();
      await permissionStore.refreshPermissions();
      const message = errorMessage(payload, "权限不足");
      ElMessage.error(message);
      return Promise.reject(new Error(message));
    }

    const message = errorMessage(payload, "请求失败");
    ElMessage.error(message);
    return Promise.reject(new Error(message));
  }
);

export default http;

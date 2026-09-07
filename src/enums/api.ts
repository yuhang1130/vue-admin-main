/**
 * API 相关枚举
 *
 * @description
 * 包含 API 响应码、请求状态等枚举定义
 */

/**
 * API 响应码枚举
 */
export const enum ApiCodeEnum {
  /**
   * 成功
   */
  SUCCESS = "00000",

  /**
   * 访问令牌无效或过期
   */
  ACCESS_TOKEN_INVALID = "INVALID_ACCESS_TOKEN",

  /**
   * 刷新令牌无效或过期
   */
  REFRESH_TOKEN_INVALID = "INVALID_REFRESH_TOKEN",

  /**
   * 权限不足
   */
  PERMISSION_DENIED = "PERMISSION_DENIED",

  /**
   * 需要选择租户
   */
  CHOOSE_TENANT = "A0250",
}

/**
 * Copyright (c) 2022 Peking University and Peking University Institute for Computing and Digital Economy
 * OpenSCOW is licensed under Mulan PSL v2.
 * You can use this software according to the terms and conditions of the Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *          http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
 * EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

import { getCommonConfig, getSystemLanguageConfig } from "@scow/config/build/common";
import { getCurrentLanguageId, getI18nConfigCurrentText } from "@scow/lib-server";
import { joinUrlPath } from "@scow/utils";
import { FastifyReply, FastifyRequest } from "fastify";
import { createCaptcha } from "src/auth/captcha";
import { authConfig, OtpStatusOptions } from "src/config/auth";
import { config } from "src/config/env";
import { AuthTextsType, languages } from "src/i18n";
import { getHostname } from "src/utils/getHostname";

export async function serveLoginHtml(
  err: boolean, callbackUrl: string, req: FastifyRequest, rep: FastifyReply,
  verifyCaptchaFail?: boolean,
  verifyOtpFail?: boolean,
) {

  const hostname = getHostname(req);
  const authUiHostnameConfig = (hostname && authConfig.ui?.hostnameMap?.[hostname]) || undefined;
  const authUiDefaultConfig = authConfig.ui?.default;

  const enableCaptcha = authConfig.captcha.enabled;
  const enableTotp = authConfig.otp?.enabled;

  // 显示绑定otp按钮：otp.enabled为true && (密钥存于ldap时 || (otp.type===remote && 配置了otp.remote.redirectUrl))
  const showBindOtpButton = authConfig.otp?.enabled && (authConfig.otp?.type === OtpStatusOptions.ldap
    || (!!authConfig.otp?.remote?.redirectUrl && authConfig.otp?.type === OtpStatusOptions.remote));
  const captchaInfo = enableCaptcha
    ? await createCaptcha(req.server)
    : undefined;

  // 获取当前语言ID及对应的登录页面文本
  const languageId = getCurrentLanguageId(req.raw, getSystemLanguageConfig(getCommonConfig().systemLanguage));
  const authTexts: AuthTextsType = languages[languageId];

  // 获取sloganI18nText
  const sloganTitle = getI18nConfigCurrentText(
    authUiHostnameConfig?.slogan?.title ?? authUiDefaultConfig?.slogan.title, languageId);
  const sloganTextArr = (authUiHostnameConfig?.slogan?.texts ?? authUiDefaultConfig?.slogan.texts)?.map((text) => {
    return getI18nConfigCurrentText(text, languageId);
  });

  return rep.status(
    verifyCaptchaFail ? 400 : err ? 401 : 200).view("login.liquid", {
    authTexts: authTexts,
    cssUrl: joinUrlPath(config.BASE_PATH, config.AUTH_BASE_PATH, "public/assets/tailwind.min.css"),
    eyeImagePath: joinUrlPath(config.BASE_PATH, config.AUTH_BASE_PATH, "public/assets/icons/eye.png"),
    eyeCloseImagePath: joinUrlPath(config.BASE_PATH, config.AUTH_BASE_PATH, "public/assets/icons/eye-close.png"),
    backgroundFallbackColor: authUiHostnameConfig?.backgroundFallbackColor
      || authUiDefaultConfig?.backgroundFallbackColor || "#e5e7eb",
    faviconUrl: joinUrlPath(config.BASE_PATH, config.AUTH_BASE_PATH, "public/assets/favicon.svg"),
    callbackUrl,
    sloganColor: authUiHostnameConfig?.slogan?.color || authUiDefaultConfig?.slogan?.color || "#374151",
    sloganTitle: sloganTitle || "",
    sloganTextArr: sloganTextArr || [],
    err,
    ...captchaInfo,
    verifyCaptchaFail,
    enableCaptcha,
    enableTotp,
    showBindOtpButton,
    verifyOtpFail,
    otpBasePath: joinUrlPath(config.BASE_PATH, config.AUTH_BASE_PATH, "public/otp"),
    refreshCaptchaPath: joinUrlPath(config.BASE_PATH, config.AUTH_BASE_PATH, "public/refreshCaptcha"),
  });

}

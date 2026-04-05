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

import { formatDateTime } from "@scow/lib-web/build/utils/datetime";
import { Descriptions, Tag, Typography } from "antd";
import { NextPage } from "next";
import { requireAuth } from "src/auth/requireAuth";
import { Section } from "src/components/Section";
import { useI18nTranslateToString } from "src/i18n";
import { PlatformRole, TenantRole } from "src/models/User";
import { antdBreakpoints } from "src/styles/constants";
import { Head } from "src/utils/head";
import { styled } from "styled-components";

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  flex-direction: column;
`;

const Part = styled(Section)`
  min-width: 400px;
  max-width: 600px;
  flex: 1;
  margin: 0 8px 16px 0;
  @media (min-width: ${antdBreakpoints.md}px) {
    margin: 0 16px 32px 0;
  }
`;

const TitleText = styled(Typography.Title)`
&& {
  width: 100vw;
  font-weight: 700;
  font-size: 24px;
  padding: 0 0 10px 20px;
  margin-left: -25px;
  border-bottom: 1px solid #ccc;
  @media (min-width: ${antdBreakpoints.md}px) {
    padding: 0 0 20px 30px;
  }
}
`;

export const ProfilePage: NextPage = requireAuth(() => true)(({ userStore: { user } }) => {

  const t = useI18nTranslateToString();

  const PlatformRoleI18nTexts = {
    [PlatformRole.PLATFORM_FINANCE]: t("userRoles.platformFinance"),
    [PlatformRole.PLATFORM_ADMIN]: t("userRoles.platformAdmin"),
  };
  const TenantRoleI18nTexts = {
    [TenantRole.TENANT_FINANCE]: t("userRoles.tenantFinance"),
    [TenantRole.TENANT_ADMIN]: t("userRoles.tenantAdmin"),
  };

  return (
    <>
      <Container>
        <Head title={t("common.userInfo")} />
        <TitleText>{t("common.userInfo")}</TitleText>
        <Part title>
          <Descriptions
            column={1}
            labelStyle={{ paddingLeft:"10px", marginBottom:"10px" }}
            contentStyle={{ paddingLeft:"10px" }}
          >
            <Descriptions.Item label={t("common.userId")}>
              {user.identityId}
            </Descriptions.Item>
            <Descriptions.Item label={t("common.userFullName")}>
              {user.name}
            </Descriptions.Item>
            <Descriptions.Item label={t("common.email")}>
              {user.email ?? ""}
            </Descriptions.Item>
            {
              user.tenantRoles.length > 0 ? (
                <Descriptions.Item label={t("common.tenantRole")}>
                  {user.tenantRoles.map((x) => (
                    <Tag
                      key={x}
                    >{TenantRoleI18nTexts[x]}</Tag>
                  ))}
                </Descriptions.Item>
              ) : undefined
            }
            {
              user.platformRoles.length > 0 ? (
                <Descriptions.Item label={t("common.platformRole")}>
                  {user.platformRoles.map((x) => (
                    <Tag
                      key={x}
                    >{PlatformRoleI18nTexts[x]}</Tag>
                  ))}
                </Descriptions.Item>
              ) : undefined
            }
            <Descriptions.Item label={t("common.createTime")}>
              {user.createTime ? formatDateTime(user.createTime) : ""}
            </Descriptions.Item>
          </Descriptions>
        </Part>
      </Container>
    </>

  );
});

export default ProfilePage;

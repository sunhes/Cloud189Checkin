require("dotenv").config();
const {
  CloudClient,
  FileTokenStore,
  logger: sdkLogger,
} = require("cloud189-sdk");
const recording = require("log4js/lib/appenders/recording");
const accounts = require("../accounts");
const { mask, delay } = require("./utils");
const push = require("./push");
const { log4js, cleanLogs, catLogs } = require("./logger");
const tokenDir = ".token";

const tokenPathFor = (userName) =>
  `${tokenDir}/${encodeURIComponent(userName)}.json`;

sdkLogger.configure({
  isDebugEnabled: process.env.CLOUD189_VERBOSE === "1",
});

// 个人任务签到
const doUserTask = async (cloudClient, logger) => {
  const result = await cloudClient.userSign()
  const netdiskBonus = result.isSign? 0: result.netdiskBonus
  logger.info(`个人签到任务: 获得 ${netdiskBonus}M 空间`);
};

const run = async (account, userSizeInfoMap, logger) => {
  const { userName, password, ssonCookie } = account;
  if (userName && (password || ssonCookie)) {
    const before = Date.now();
    try {
      logger.log("开始执行");
      const cloudClient = new CloudClient({
        username: userName,
        password,
        ssonCookie,
        token: new FileTokenStore(tokenPathFor(userName)),
      });
      const beforeUserSizeInfo = await cloudClient.getUserSizeInfo();
      userSizeInfoMap.set(userName, {
        cloudClient,
        userSizeInfo: beforeUserSizeInfo,
        logger,
      });
      await Promise.all([doUserTask(cloudClient, logger)]);
    } catch (e) {
      if (e.response) {
        logger.log(`请求失败: ${e.response.statusCode}, ${e.response.body}`);
      } else {
        logger.error(e);
      }
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (errorMessage === "账户名或密码错误") {
        logger.error(
          "天翼登录失败：请更新账号密码；如果网页登录要求验证，可改用 ssonCookie 登录"
        );
      } else if (errorMessage.includes("图形验证码")) {
        logger.error(
          "天翼登录触发了图形验证码：请先在网页登录完成验证，再使用 ssonCookie 登录"
        );
      } else if (errorMessage.includes("设备ID不存在") || errorMessage.includes("二次设备校验")) {
        logger.error(
          "天翼登录需要二次设备校验：请在天翼云盘 App/账号安全中关闭设备锁，或改用 ssonCookie 登录"
        );
      }
      throw e;
    } finally {
      logger.log(
        `执行完毕, 耗时 ${((Date.now() - before) / 1000).toFixed(2)} 秒`
      );
    }
  }
};

// 开始执行程序
async function main() {
  //  用于统计实际容量变化
  const userSizeInfoMap = new Map();
  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index];
    const { userName } = account;
    const userNameInfo = mask(userName, 3, 7);
    const logger = log4js.getLogger(userName);
    logger.addContext("user", userNameInfo);
    await run(account, userSizeInfoMap, logger);
  }

  //数据汇总
  for (const [
    userName,
    { cloudClient, userSizeInfo, logger },
  ] of userSizeInfoMap) {
    const afterUserSizeInfo = await cloudClient.getUserSizeInfo();
    logger.log(
      `个人容量：⬆️  ${(
        (afterUserSizeInfo.cloudCapacityInfo.totalSize -
          userSizeInfo.cloudCapacityInfo.totalSize) /
        1024 /
        1024
      ).toFixed(2)}M/${(
        afterUserSizeInfo.cloudCapacityInfo.totalSize /
        1024 /
        1024 /
        1024
      ).toFixed(2)}G`,
      `家庭容量：⬆️  ${(
        (afterUserSizeInfo.familyCapacityInfo.totalSize -
          userSizeInfo.familyCapacityInfo.totalSize) /
        1024 /
        1024
      ).toFixed(2)}M/${(
        afterUserSizeInfo.familyCapacityInfo.totalSize /
        1024 /
        1024 /
        1024
      ).toFixed(2)}G`
    );
  }
}

(async () => {
  try {
    await main();
    //等待日志文件写入
    await delay(1000);
  } finally {
    const logs = catLogs();
    const events = recording.replay();
    const content = events.map((e) => `${e.data.join("")}`).join("  \n");
    push("天翼云盘自动签到任务", logs + content);
    recording.erase();
    cleanLogs();
  }
})();

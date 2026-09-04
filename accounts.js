function normalizeAccount(account, index) {
    if (!account || typeof account !== "object") {
        throw new Error(`第 ${index} 个账号配置必须是对象`)
    }

    const userName = typeof account.userName === "string"
        ? account.userName.trim()
        : ""
    const password = typeof account.password === "string"
        ? account.password
        : ""
    const ssonCookie = typeof account.ssonCookie === "string"
        ? account.ssonCookie.trim()
        : ""

    if (!userName) {
        throw new Error(`第 ${index} 个账号缺少 userName`)
    }
    if (!password && !ssonCookie) {
        throw new Error(`第 ${index} 个账号必须配置 password 或 ssonCookie`)
    }

    return { userName, password, ssonCookie }
}

function parseAccounts(raw, fallbackSsonCookie = "") {
    let parsed
    try {
        parsed = JSON.parse(raw)
    } catch (error) {
        throw new Error("TY_ACCOUNTS 必须是合法的 JSON 数组，请检查引号和特殊字符")
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("TY_ACCOUNTS 必须是至少包含一个账号的 JSON 数组")
    }

    return parsed.map((account, index) => {
        const ssonCookie = index === 0 && fallbackSsonCookie && !account.ssonCookie
            ? fallbackSsonCookie
            : account.ssonCookie
        return normalizeAccount({ ...account, ssonCookie }, index + 1)
    })
}

function loadAccountsFromEnv() {
    const rawAccounts = process.env.TY_ACCOUNTS?.trim()
    if (rawAccounts) {
        return parseAccounts(rawAccounts, process.env.TY_SSON_COOKIE?.trim())
    }

    const accounts = []
    let index = 1
    while (true) {
        const userName = process.env[`TY_USERNAME_${index}`]?.trim()
        const password = process.env[`TY_PASSWORD_${index}`] || ""
        const ssonCookie = process.env[`TY_SSON_COOKIE_${index}`]?.trim()
            || (index === 1 ? process.env.TY_SSON_COOKIE?.trim() : "")

        if (!userName && !password && !ssonCookie) {
            break
        }

        accounts.push(normalizeAccount({ userName, password, ssonCookie }, index))
        index++
    }

    if (accounts.length === 0) {
        throw new Error("未配置天翼云账号，请设置 TY_ACCOUNTS 或 TY_USERNAME_1/TY_PASSWORD_1")
    }

    return accounts
}

module.exports = loadAccountsFromEnv()

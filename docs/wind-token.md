# WIND 游戏代币接入

核验日期：2026-09-29。WIND 已设为游戏默认测试网代币，支持 `TOKEN_ADDRESS` 环境变量覆盖。

| 项目 | 值 |
| --- | --- |
| 网络 | Robinhood Chain Testnet，46630 |
| 名称 / 符号 | WIND / WIND |
| 合约 | `0xF08b54449B2f6EDd2D4af0A69DFd0cBfff6C8acB` |
| 小数位 / 总量 | 18 / 1,000,000,000 |
| 当前发行工厂 | `0x40f1be6faf8DAB9C143cce1a0A04c2075Fb2DF59` |
| Launch ID | 141941 |
| 购买曲线 | `0x1405653aEDA20A35c7f1D9eA4e3F6Fb430743C83` |
| 领主门槛 | 100,000 WIND，可通过 `LORD_MIN` 调整 |

## 玩家入口

进入游戏后点击右上角「连接钱包」。WIND 卡片显示狐狸 Logo、合约、钱包持仓与领主门槛，支持复制合约、打开发行页和请求钱包添加代币。点击「去商店购买 WIND」进入购买区。

钱包登录请求签名，由服务端读取 WIND 的 `balanceOf` 判定居民或领主。领主可建房，技能成长 +50%；沿用原有建房材料与持仓衰减规则。采集、任务获得的金币仍是游戏内记账单位，不会兑换或自动铸造 WIND。

商店提供 0.001 / 0.005 / 0.01 测试 ETH 三档。报价实时读取；显示预期获得量和最低获得量，滑点沿用 3%，交易有效期 10 分钟。每笔购买需要玩家钱包确认。添加代币或签名登录不会发起购买。

## 实际合约接口

WIND 使用当前发行工厂，未登记在旧 V6 工厂。通过 `isSeedifyToken`、`launchIdOfToken`、`curveAt` 查找曲线，再核对曲线的 `token()` 和 `factory()`。

当前 ETH 曲线使用 `quoteBuy(uint256)` 报价，返回数组第一个值为代币获得量；购买调用 `buy(uint256 minTokensOut, uint256 deadline)`，测试 ETH 通过 `value` 传入，代币归属于交易发送方。前端核对网络、代币、曲线与发送方，并在切换网络后再次检查钱包账号。旧 V6 的 `quoteBuyExactIn` / `buyExactIn` 路径保留，避免将两套 ABI 混用。

每次报价前重读 `quoteCurrency`、`complete`、`graduated`；非 ETH 配对、完成或毕业的曲线不再生成游戏内购买请求，玩家可打开发行页查看后续交易方式。RPC 不可用、网络错误或曲线绑定错误均不冒充可购买状态；代币精度未核验前不解释链上余额。

后端继续直连官方测试网 RPC。本机共享 Robinhood 网关用于 chain ID 4663，与测试网 46630 不同，因此没有改用主网网关。

## 来源与验证

- [WIND 发行页](https://testnet.vibevibe.fun/token/0xF08b54449B2f6EDd2D4af0A69DFd0cBfff6C8acB)
- [WIND 创建交易](https://explorer.testnet.chain.robinhood.com/tx/0xe6d1aee35db9ed1b0272873fd6cb18e5fab2f15dc509cbdd212a8f0d0a7b788f)
- [发行站部署信息](https://testnet.vibevibe.fun/static-v2/deploymentEnvironment-Bg-EyyZE.js)
- [发行站公开 ABI](https://testnet.vibevibe.fun/static-v2/abis-BQmJhtSK.js)

已用官方 RPC 验证网络、代币元信息、工厂登记、曲线双向绑定、ETH 配对，以及三档实时只读报价。用实际构建出的交易执行 `eth_call` 模拟成功，没有广播交易。34 项自动测试覆盖当前和旧 V6 的参数编码、最低获得量、错误网络、未知精度、错误曲线、毕业/完成、空报价和游戏原有规则。

玩家在浏览器插件内确认购买与交易最终上链，需要实际使用钱包完成；本次没有使用用户私钥或替用户发起购买。

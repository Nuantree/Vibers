const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => Math.floor(value).toLocaleString('en-US');

export function renderTokenPanel(cfg, player) {
  const token = cfg.token, fresh = player.wallet && player.balanceStatus === 'fresh';
  const balance = fresh ? `${number(player.balance)} ${esc(token.symbol)}` : player.wallet ? '持仓暂未读取成功' : '连接钱包后查看';
  const remaining = fresh ? Math.max(0, cfg.lordMin - player.balance) : null;
  const progress = fresh ? Math.min(100, Math.max(0, player.balance / cfg.lordMin * 100)) : 0;
  const status = remaining === 0 ? '已达到领主门槛 · 建房与技能成长 +50%' : remaining !== null ? `再持有 ${number(Math.ceil(remaining))} ${esc(token.symbol)} 可成为领主` : `持有 ${number(cfg.lordMin)} ${esc(token.symbol)}，解锁领主生活`;
  return `<section class="token-card" aria-label="游戏代币 ${esc(token.symbol)}">
    <div class="token-heading">${token.logoUrl ? `<img src="${esc(token.logoUrl)}" width="64" height="64" alt="${esc(token.symbol)} 小狐狸代币 Logo"/>` : '<span class="token-fallback">✦</span>'}<div><span class="token-kicker">WINDHAVEN · GAME TOKEN</span><h3>${esc(token.symbol)}</h3><p>${esc(token.name)} · Robinhood 测试网</p></div><span class="token-testnet">TESTNET</span></div>
    <div class="token-holding"><span>我的链上持仓</span><strong>${balance}</strong></div>
    <div class="meter token-progress" role="progressbar" aria-label="领主资格进度" aria-valuemin="0" aria-valuemax="100" ${fresh ? `aria-valuenow="${Math.round(progress)}"` : ''}><i style="width:${progress}%"></i></div>
    <p class="token-status">${status}</p>
    <a class="token-address" href="${esc(cfg.chain.explorer)}/address/${esc(token.address)}" target="_blank" rel="noopener" title="查看代币合约">${esc(token.address)}</a>
    <div class="token-actions"><a href="${esc(cfg.vibeUrl)}" target="_blank" rel="noopener">在 vibe/vibe 查看 ↗</a><button class="text-button" data-copy-token>复制合约</button><button class="text-button" data-watch-token ${!token.metadataReady ? 'disabled' : ''}>添加到钱包</button></div>
  </section>`;
}

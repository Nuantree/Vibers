// Shared game rules: the server owns all rewards, inventory and action outcomes.
export const ITEMS = {
  flower: { name: '星铃花', icon: 'flower', color: '#c6a0c9' },
  log: { name: '橡木', icon: 'wood', color: '#b9976a' },
  ore: { name: '铁矿', icon: 'ore', color: '#9cafb9' },
  herb: { name: '月光草', icon: 'herb', color: '#9fc498' },
  fish: { name: '银鳞鱼', icon: 'fish', color: '#86bfca' },
  crystal: { name: '星辉碎片', icon: 'crystal', color: '#b4a2d6' },
  potion: { name: '生命药水', icon: 'potion', color: '#df8d87' },
};
export const TRAINING = { x:42, y:32 };
export const RECIPES = [
  { id: 'armor', name: '星辉护甲', icon: 'shield', desc: '受到的伤害降低 25%，装备后外观可见', cost: { ore: 8, crystal: 3 }, equipment: 'armor' },
  { id: 'axe', name: '精工斧镐', icon: 'axe', desc: '采集时额外获得 1 份资源', cost: { log: 5, ore: 3 }, equipment: 'axe' },
  { id: 'sword', name: '守林人长剑', icon: 'sword', desc: '攻击伤害从 12 提升至 22', cost: { log: 4, ore: 5 }, equipment: 'sword' },
  { id: 'rod', name: '柳木钓竿', icon: 'fish', desc: '解锁水边钓鱼，有机会钓到星辉碎片', cost: { log: 4, herb: 2 }, equipment: 'rod' },
  { id: 'potion', name: '生命药水', icon: 'potion', desc: '饮用恢复 45 点生命', cost: { herb: 3 }, output: { potion: 1 } },
  { id: 'meal', name: '篝火烤鱼', icon: 'fire', desc: '立即恢复全部生命', cost: { fish: 2, log: 1 }, heal: true },
];
export const QUESTS = [
  { id: 'wood', title: '森林的第一份礼物', desc: '采集 5 份橡木，为旅途准备物资。', stat: 'log', need: 5, gold: 20, xp: 35, target: 'forest', icon: 'wood' },
  { id: 'ore', title: '石头里的光', desc: '采集 4 份铁矿，打造你的第一件装备。', stat: 'ore', need: 4, gold: 25, xp: 40, target: 'quarry', icon: 'ore' },
  { id: 'craft', title: '工欲善其事', desc: '在制作台完成任意 1 次制作。', stat: 'crafted', need: 1, gold: 30, xp: 45, target: 'workshop', icon: 'axe' },
  { id: 'slime', title: '林间小小守护者', desc: '击败 3 只游荡的苔藓史莱姆。', stat: 'kills', need: 3, gold: 50, xp: 65, target: 'forest', icon: 'sword' },
  { id: 'fish', title: '把时间交给湖泊', desc: '钓起 3 条银鳞鱼。', stat: 'fish', need: 3, gold: 40, xp: 55, target: 'lake', icon: 'fish' },
  { id: 'explore', title: '地图之外的故事', desc: '发现 4 处地标，让脚步留下故事。', stat: 'explored', need: 4, gold: 60, xp: 80, target: 'ruins', icon: 'compass' },
  { id: 'treasure', title: '旧时代的回声', desc: '打开 2 个藏在大陆上的宝箱。', stat: 'chests', need: 2, gold: 80, xp: 100, target: 'ruins', icon: 'chest' },
];
export const POIS = [
  { id: 'village', name: '风栖小镇', sub: '每一段冒险的起点', x: 40, y: 30, icon: 'home', color: '#e6c88c' },
  { id: 'forest', name: '低语森林', sub: '橡木 · 月光草 · 史莱姆', x: 29, y: 27, icon: 'tree', color: '#9bc99b' },
  { id: 'quarry', name: '暮石矿场', sub: '铁矿 · 星辉碎片', x: 53, y: 34, icon: 'ore', color: '#b6c3cc' },
  { id: 'lake', name: '镜月湖', sub: '银鳞鱼 · 安静的时光', x: 50, y: 21, icon: 'fish', color: '#86c5cf' },
  { id: 'ruins', name: '守望者遗迹', sub: '远古守卫 · 遗失宝藏', x: 22, y: 15, icon: 'ruins', color: '#baa2d6' },
];
export const STATIONS = [
  { id: 'merchant', name: '旅人商店', x: 40, y: 27, icon: 'bag' },
  { id: 'workshop', name: '林间工坊', x: 44, y: 29, icon: 'axe' },
  { id: 'camp', name: '温暖的篝火', x: 37, y: 31, icon: 'fire' },
  { id: 'board', name: '冒险委托', x: 36, y: 27, icon: 'scroll' },
];
export const CHESTS = [
  { id: 'forest-cache', x: 27, y: 24 }, { id: 'ruin-cache', x: 22, y: 15 },
  { id: 'lake-cache', x: 56, y: 20 }, { id: 'south-cache', x: 35, y: 44 },
];
export const levelFor = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 60));
export const xpFor = (level) => (level - 1) ** 2 * 60;
export const maxHealth = (xp) => 100 + (levelFor(xp) - 1) * 10;
export const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const SUPPLIES = [
  { id: 'potion', name: '生命药水', item: 'potion', amount: 1, price: 12 },
  { id: 'herbs', name: '草药小包', item: 'herb', amount: 2, price: 8 },
  { id: 'ore', name: '铁矿补给', item: 'ore', amount: 3, price: 15 },
];
export const DECOR = [
  { id:'inn', name:'风栖旅舍', kind:'cottage', x:33, y:25, w:3, h:2, roof:'moss' },
  { id:'cabin', name:'守林人的家', kind:'cottage', x:43, y:24, w:3, h:2, roof:'clay' },
];
export const decorAt = (x,y) => DECOR.some(d=>x>=d.x&&x<d.x+d.w&&y>=d.y&&y<d.y+d.h);

export const GARDENS = [
  {id:'fern',name:'蕨叶花圃',x:36,y:29},
  {id:'dew',name:'朝露花圃',x:37,y:29},
  {id:'star',name:'星光花圃',x:38,y:29},
];
export const CROPS = [
  {id:'moonherb',name:'月光草',item:'herb',amount:2,growMs:60000,color:'#a4c98d',desc:'60 秒成熟，收获 2 月光草。'},
  {id:'starflower',name:'星铃花',item:'flower',amount:1,growMs:90000,color:'#d5afd7',desc:'90 秒成熟，收获 1 星铃花，可送给伙伴。'},
];
export const COMPANIONS = [
  {id:'fox',name:'绒尾小狐',defaultName:'团团',desc:'一条蓬松的大尾巴，一颗想跟你出发的心。',color:'#cf9964'},
  {id:'bunny',name:'奶油小兔',defaultName:'糯糯',desc:'会竖起耳朵，也会把每一步走成小小的跳跃。',color:'#dfd5bc'},
];
export const CLOAKS = [
  {id:'sage',name:'苔绿',color:'#728b62'},
  {id:'amber',name:'琥珀',color:'#c49863'},
  {id:'iris',name:'鸢尾',color:'#a08cae'},
  {id:'rose',name:'莓果',color:'#c68d93'},
  {id:'sky',name:'雾蓝',color:'#83a5b9'},
];
export const gardenStage=(plot,time=Date.now())=>!plot?'empty':time>=plot.readyAt?'ready':'growing';

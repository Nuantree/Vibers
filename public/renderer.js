export async function createRenderer(canvas,state){
  try{const module=await import('./renderer3d.js');return module.createRenderer(canvas,state);}
  catch(error){
    console.warn('3D initialization unavailable; using the compatible renderer.',error);
    const fresh=canvas.cloneNode(true);canvas.replaceWith(fresh);document.getElementById('worldOverlay')?.remove();
    const {createRenderer}=await import('./renderer2d.js');fresh.dataset.renderer='Canvas 2D';
    const renderer=createRenderer(fresh,state);document.body.classList.add('renderer-fallback');return renderer;
  }
}

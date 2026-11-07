/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type { Disposer, Three } from './resources';
import { seeded } from './resources';

function canvas(width: number, height: number) {
	const element = document.createElement('canvas');
	element.width = width;
	element.height = height;
	const context = element.getContext('2d');
	if (!context) throw new Error('2D canvas is not available');
	return { element, context };
}

export function floorTexture(T: Three, d: Disposer, repeatX: number, repeatY: number) {
	const { element, context } = canvas(256, 256);
	context.fillStyle = '#141b29';
	context.fillRect(0, 0, 256, 256);
	const random = seeded(7);
	for (let index = 0; index < 900; index++) {
		context.fillStyle = `rgba(255,255,255,${(random() * 0.035).toFixed(3)})`;
		context.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
	}
	context.strokeStyle = 'rgba(120,150,210,0.16)';
	context.lineWidth = 2;
	context.strokeRect(1, 1, 254, 254);
	context.strokeStyle = 'rgba(120,150,210,0.07)';
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(128, 0);
	context.lineTo(128, 256);
	context.moveTo(0, 128);
	context.lineTo(256, 128);
	context.stroke();
	const texture = d.track(new T.CanvasTexture(element));
	texture.colorSpace = T.SRGBColorSpace;
	texture.wrapS = T.RepeatWrapping;
	texture.wrapT = T.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.anisotropy = 4;
	return texture;
}

export function skyTexture(T: Three, d: Disposer) {
	const { element, context } = canvas(8, 512);
	const gradient = context.createLinearGradient(0, 0, 0, 512);
	gradient.addColorStop(0, '#070b1c');
	gradient.addColorStop(0.35, '#16224a');
	gradient.addColorStop(0.62, '#3b4f8e');
	gradient.addColorStop(0.82, '#c9748a');
	gradient.addColorStop(0.93, '#f0a56d');
	gradient.addColorStop(1, '#f6c58a');
	context.fillStyle = gradient;
	context.fillRect(0, 0, 8, 512);
	const texture = d.track(new T.CanvasTexture(element));
	texture.colorSpace = T.SRGBColorSpace;
	return texture;
}

export function windowsTexture(T: Three, d: Disposer) {
	const { element, context } = canvas(64, 128);
	context.fillStyle = '#000';
	context.fillRect(0, 0, 64, 128);
	const random = seeded(11);
	for (let y = 0; y < 128; y += 4) {
		for (let x = 0; x < 64; x += 4) {
			if (random() > 0.42) continue;
			const warm = random() > 0.3;
			const alpha = 0.45 + random() * 0.55;
			context.fillStyle = warm ? `rgba(255,214,150,${alpha})` : `rgba(160,198,255,${alpha})`;
			context.fillRect(x + 1, y + 1, 2, 2);
		}
	}
	const texture = d.track(new T.CanvasTexture(element));
	texture.colorSpace = T.SRGBColorSpace;
	texture.wrapS = T.RepeatWrapping;
	texture.wrapT = T.RepeatWrapping;
	texture.magFilter = T.NearestFilter;
	return texture;
}

/** Soft round blob used for contact shadows and dust. */
export function blobTexture(T: Three, d: Disposer) {
	const { element, context } = canvas(64, 64);
	const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
	gradient.addColorStop(0, 'rgba(255,255,255,1)');
	gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
	gradient.addColorStop(1, 'rgba(255,255,255,0)');
	context.fillStyle = gradient;
	context.fillRect(0, 0, 64, 64);
	return d.track(new T.CanvasTexture(element));
}

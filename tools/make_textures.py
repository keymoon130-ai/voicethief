# Voice Thief 텍스처 생성기: 이어 붙여도 이음새가 없는 색 / 노멀 / 거칠기 맵
import numpy as np
from PIL import Image
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'tex')
rng = np.random.default_rng(7)

def noise(n, beta=2.0, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    k = np.sqrt(fx**2 + fy**2); k[0, 0] = 1
    spec = (r.normal(size=(n, n)) + 1j * r.normal(size=(n, n))) / k**(beta / 2)
    spec[0, 0] = 0
    a = np.real(np.fft.ifft2(spec))
    a -= a.min(); a /= a.max()
    return a

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    L = np.sqrt(dx**2 + dy**2 + nz**2)
    n = np.stack([-dx / L, dy / L, nz / L], -1)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def save(name, rgb, h, rough, strength=6, q=84):
    Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}_col.jpg', quality=q)
    Image.fromarray(normal_from_height(h, strength)).save(f'{OUT}/{name}_nrm.jpg', quality=q)
    Image.fromarray(np.clip(rough * 255, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}_rgh.jpg', quality=q)

def col(hexs):
    hexs = hexs.lstrip('#'); return np.array([int(hexs[i:i + 2], 16) / 255 for i in (0, 2, 4)])

def mix(a, b, t): return a * (1 - t[..., None]) + b * t[..., None]
def smooth(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def streaks(n, count, color_strength, seed, length=(0.2, 0.7), width=(2, 8)):
    r = np.random.default_rng(seed); m = np.zeros((n, n))
    for _ in range(count):
        x = r.integers(0, n); y0 = r.integers(0, n); L = int(n * r.uniform(*length)); w = r.integers(*width)
        ys = (y0 + np.arange(L)) % n
        fade = np.linspace(1, 0, L) ** 1.5 * color_strength * r.uniform(0.5, 1)
        for i in range(-w, w + 1):
            xx = (x + i) % n; m[ys, xx] = np.maximum(m[ys, xx], fade * (1 - abs(i) / (w + 1)))
    return m

N = 1024
# 1) 콘크리트 바닥 (기름때, 물 얼룩, 금)
def concrete(name, base, dark):
    big, mid, fine = noise(N, 2.4), noise(N, 1.6), noise(N, 0.6)
    stain = smooth(0.55, 0.8, noise(N, 3.0))
    cracks = np.zeros((N, N))
    r = np.random.default_rng(11)
    for _ in range(14):
        x, y = r.uniform(0, N, 2); a = r.uniform(0, 6.28)
        for s in range(int(r.uniform(60, 260))):
            a += r.normal(0, 0.25); x = (x + np.cos(a) * 2) % N; y = (y + np.sin(a) * 2) % N
            cracks[int(y), int(x)] = 1; cracks[int(y), (int(x) + 1) % N] = 0.6
    h = big * 0.5 + mid * 0.35 + fine * 0.15 - cracks * 0.6
    c = mix(col(base), col(dark), np.clip(big * 0.6 + mid * 0.4, 0, 1))
    c = c * (0.85 + fine[..., None] * 0.3)
    c = mix(c, col('#1d1a17'), stain * 0.55)
    c = mix(c, col('#0e0d0c'), cracks)
    rough = 0.93 - stain * 0.3 + fine * 0.05
    save(name, c, h, rough, 5)
concrete('concrete', '#6b6862', '#45423d')
concrete('ceiling', '#2c2b2a', '#1a1918')

# 2) 타일 바닥 (교육실, 광장): 체크 무늬, 깨진 타일, 줄눈 때
def tiles():
    t = 8; s = N // t
    yy, xx = np.mgrid[0:N, 0:N]
    gx, gy = xx // s, yy // s
    check = ((gx + gy) % 2).astype(float)
    lx, ly = xx % s, yy % s
    grout = ((lx < 5) | (ly < 5)).astype(float)
    r = np.random.default_rng(3); tilev = r.uniform(0.85, 1.05, (t, t))[gy, gx]
    broken = (r.random((t, t)) < 0.12)[gy, gx] * smooth(0.45, 0.6, noise(N, 2.0, 4))
    a = col('#c9c1ad'); b = col('#5f8f86')
    c = mix(a[None, None] * np.ones((N, N, 1)), b[None, None] * np.ones((N, N, 1)), check) * tilev[..., None]
    dirt = noise(N, 2.2)
    c = c * (0.65 + dirt[..., None] * 0.45)
    c = mix(c, col('#24201b'), grout * 0.9)
    c = mix(c, col('#3a362f'), broken)
    h = 1 - grout * 0.8 - broken * 0.5 + noise(N, 0.8) * 0.05
    rough = 0.35 + grout * 0.55 + broken * 0.4 + dirt * 0.2
    save('tiles', c, h, rough, 7)
tiles()

# 3) 녹슨 철판 (셔터, 기계, 공장 벽 아래): 페인트 + 녹 + 리벳 + 줄
def metal(name, paint):
    rustm = smooth(0.5, 0.72, noise(N, 2.6) * 0.7 + noise(N, 1.2) * 0.3)
    fine = noise(N, 0.5)
    c = col(paint) * (0.85 + noise(N, 2.0)[..., None] * 0.25)
    rust = mix(np.ones((N, N, 3)) * col('#7a3f1c'), np.ones((N, N, 3)) * col('#3d1f0e'), noise(N, 1.0))
    c = mix(c, rust, rustm)
    c = mix(c, col('#4a2410'), streaks(N, 40, 0.6, 5))
    yy, xx = np.mgrid[0:N, 0:N]
    seam = ((yy % 256) < 6).astype(float)
    rivet = np.zeros((N, N))
    for y in range(18, N, 256):
        for x in range(32, N, 64):
            d = np.sqrt((yy - y) ** 2 + (xx - x) ** 2); rivet = np.maximum(rivet, np.clip(1 - d / 9, 0, 1))
    c = mix(c, col('#1a1716'), seam * 0.7)
    h = 0.5 + rustm * 0.25 * fine + rivet * 0.6 - seam * 0.4
    rough = 0.45 + rustm * 0.5 + fine * 0.05
    c = c * (1 - rivet[..., None] * 0.2)
    save(name, c, h, rough, 6)
metal('metal', '#58646b')
metal('metal_yellow', '#b38a2e')

# 4) 페인트 벽 (위는 얼룩진 회벽, 아래는 색 페인트 벽판, 벗겨짐, 녹물): 2:1
def paintwall(name, paint, W=1024, H=512):
    big = noise(W, 2.4, 21)[:H]; fine = noise(W, 0.7, 22)[:H]; peel_n = noise(W, 2.0, 23)[:H]
    yy, xx = np.mgrid[0:H, 0:W]
    band = (yy > H * 0.58).astype(float)
    plaster = mix(np.ones((H, W, 3)) * col('#cbc2ae'), np.ones((H, W, 3)) * col('#8f8676'), big)
    p = col(paint); pc = mix(np.ones((H, W, 3)) * p, np.ones((H, W, 3)) * p * 0.7, big)
    # 띠 무늬
    stripe = (((xx + (H - yy)) // 40) % 2 == 0) & (yy > H * 0.62) & (yy < H * 0.7)
    pc = mix(pc, np.ones((H, W, 3)) * np.clip(p * 1.3 + 0.1, 0, 1), stripe.astype(float) * 0.7)
    c = mix(plaster, pc, band)
    trim = ((yy > H * 0.565) & (yy < H * 0.6)).astype(float)
    c = mix(c, col('#e9e2cf'), trim * 0.85)
    peel = smooth(0.62, 0.66, peel_n) * band
    c = mix(c, col('#a59a86'), peel)
    s = streaks(W, 30, 0.7, 24, (0.15, 0.5))[:H]
    c = mix(c, col('#5a3216'), s * 0.8)
    grime = smooth(0.3, 1.0, yy / H) * 0.35 + smooth(0.0, 0.15, 1 - yy / H) * 0.25
    c = c * (1 - grime[..., None] * (0.6 + 0.4 * big[..., None]))
    c = c * (0.9 + fine[..., None] * 0.18)
    h = 0.5 + fine * 0.1 + band * 0.08 - peel * 0.12 + trim * 0.25
    rough = 0.8 - band * 0.35 + peel * 0.3 + fine * 0.05
    Image.fromarray(np.clip(c * 255, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}_col.jpg', quality=84)
    return h, rough
h, rough = paintwall('wall_mint', '#4fae96')
Image.fromarray(normal_from_height(h, 5)).save(f'{OUT}/wall_nrm.jpg', quality=84)
Image.fromarray(np.clip(rough * 255, 0, 255).astype(np.uint8)).save(f'{OUT}/wall_rgh.jpg', quality=84)
for nm, cc in [('pink', '#d0628f'), ('yellow', '#d6a634'), ('blue', '#4a7fbf'), ('red', '#b9483d'), ('purple', '#8a6cc4'), ('gray', '#5d6670')]:
    paintwall('wall_' + nm, cc)

# 5) 벽돌 (소각로)
def brick():
    yy, xx = np.mgrid[0:N, 0:N]
    bh, bw = 64, 128
    row = yy // bh; off = (row % 2) * (bw // 2)
    lx = (xx + off) % bw; ly = yy % bh
    mortar = ((lx < 8) | (ly < 8)).astype(float)
    r = np.random.default_rng(9); bid = (row * 50 + (xx + off) // bw) % 997
    tint = r.uniform(0.7, 1.1, 997)[bid]
    soot = smooth(0.3, 0.9, noise(N, 2.5) * 0.6 + (1 - yy / N) * 0.6)
    c = col('#7a3a2a') * tint[..., None] * (0.8 + noise(N, 0.9)[..., None] * 0.3)
    c = mix(c, col('#3b3530'), mortar)
    c = mix(c, col('#0e0b09'), soot * 0.8)
    h = 1 - mortar * 0.7 + noise(N, 1.0) * 0.1
    save('brick', c, h, 0.85 + mortar * 0.1 - soot * 0.1, 7)
brick()

# 6) 골판지 (상자)
def cardboard():
    yy, xx = np.mgrid[0:N, 0:N]
    flute = (np.sin(xx / N * 2 * np.pi * 96) * 0.5 + 0.5)
    c = col('#a8824f') * (0.85 + noise(N, 1.6)[..., None] * 0.25) * (0.94 + flute[..., None] * 0.06)
    tape = (np.abs(yy - N // 2) < 70).astype(float)
    c = mix(c, col('#cdb98e'), tape * 0.85)
    wet = smooth(0.62, 0.8, noise(N, 2.4))
    c = mix(c, col('#5a4426'), wet * 0.6)
    h = flute * 0.08 + noise(N, 1.2) * 0.15 + tape * 0.05
    save('cardboard', c, h, 0.9 - tape * 0.5, 4)
cardboard()

# 7) 사무실 벽지, 카펫 타일
def wallpaper():
    H, W = 512, 1024
    yy, xx = np.mgrid[0:H, 0:W]
    pat = ((np.sin(xx / 22) * np.sin(yy / 22)) > 0.55).astype(float)
    big = noise(W, 2.4, 31)[:H]
    c = mix(np.ones((H, W, 3)) * col('#b8ad84'), np.ones((H, W, 3)) * col('#8f8462'), pat * 0.5)
    c = c * (0.8 + big[..., None] * 0.3)
    c = mix(c, col('#4d3a20'), streaks(W, 20, 0.5, 33)[:H])
    base = (yy > H * 0.9).astype(float); c = mix(c, col('#3b2a1c'), base)
    Image.fromarray(np.clip(c * 255, 0, 255).astype(np.uint8)).save(f'{OUT}/wallpaper_col.jpg', quality=84)
wallpaper()
def carpet():
    t = 4; s = N // t; yy, xx = np.mgrid[0:N, 0:N]
    r = np.random.default_rng(41); tv = r.uniform(0.8, 1.1, (t, t))[yy // s, xx // s]
    fib = noise(N, 0.2); c = col('#4b4a5a') * tv[..., None] * (0.75 + fib[..., None] * 0.4)
    c = mix(c, col('#1e1a18'), smooth(0.6, 0.85, noise(N, 2.6)) * 0.7)
    seam = (((xx % s) < 3) | ((yy % s) < 3)).astype(float); c = mix(c, col('#1d1c22'), seam * 0.6)
    save('carpet', c, fib * 0.3 - seam * 0.2, np.full((N, N), 0.95), 3)
carpet()
print('done', sorted(os.listdir(OUT)))

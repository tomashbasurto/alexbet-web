import json, os, subprocess, wave
L = json.load(open(os.path.join(os.path.dirname(__file__),'lineas.json')))
os.makedirs('out', exist_ok=True)
dur = {}
for i, t in enumerate(L):
    f = f'out/v{i:02d}.wav'
    subprocess.run(['piper','--model','voz.onnx','--length_scale','0.92','--output_file',f], input=t.encode(), check=True)
    w = wave.open(f); dur[f] = w.getnframes()/w.getframerate(); w.close()
json.dump(dur, open('out/dur.json','w'), indent=1); print(dur)

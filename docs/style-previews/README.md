# Style previews

The pictures "Pick a style" shows (M16-15, `app/src/renderer/styles/<id>.jpg`, 640 by 360). Six are drawn here, one
scene a second in `index.html` (words, paper, tour, shapes, night, ink); `story.jpg` is a frame of Kushmanji's own story
ad (18.5 s) and `figure.jpg` one of Claude's trailer (3 s). Each style's written contract is in `app/src/main/styles.js`.

To remake the six, from this folder (Git Bash, on the app's own Node):

```
ELECTRON_RUN_AS_NODE=1 ../../app/node_modules/electron/dist/electron.exe ../../app/node_modules/hyperframes/dist/cli.js snapshot . --at 0.5,1.5,2.5,3.5,4.5,5.5 --no-end --output shots
```

then scale each `shots/frame-0N-at-*.png` to 640 by 360 as JPG (`ffmpeg -i <png> -vf scale=640:360 -q:v 4 <id>.jpg`), in
the order above. A new style needs a scene here (or a frame of a real video in it), an entry in `STYLES` in styles.js
and in `STYLE_CARDS` in `renderer/editActions.js` under the same id, and its two lines in words/kn.js and hi.js.

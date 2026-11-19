# Download folder

The local full-access build is published as a portable ZIP. To regenerate it from the rebuilt
app and attach it to the Downloads page:

```
powershell -ExecutionPolicy Bypass -File tools\package-app.ps1
```

The script copies `C:\Users\Wick\WickedImguiMaker\dist` into `Wicked Imgui Maker\`,
adds a `README-FIRST.txt`, creates `WickedImgui-Portable-<version>.zip`, then calls
`tools\attach-release.ps1` to update `js/release.js` with the real size and SHA-256. The same script writes `latest.json` and `latest.yml` into this folder — those two files are the self-hosted auto-update feed. Upload all three together when you publish.

You can also manually put a build in this folder and run:

```
powershell -File tools\attach-release.ps1 -Zip "downloads\your-build.zip" -Version "2.2.0"
```

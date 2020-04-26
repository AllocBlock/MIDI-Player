var isFileLoading = false;
/* 选择文件 */
function clickFileSelect(e){
    // 如果正在加载，则暂时禁止选择文件
    if (isFileLoading){
        console.log("正在加载前一个文件");
        e.preventDefault();
        return;
    }
    if (!isAudioSourceLoaded){
        console.log("正在加载音源，请稍等...");
        e.preventDefault();
        return;
    }
    e.currentTarget.value = "";
}

function clickFileSelected(e){
    readFile(e.currentTarget.files[0]);
}

/* 加载midi文件 */
function readFile(file){
    if (file == null){
        console.log("打开文件失败！");
        return;
    }

    isFileLoading = true;

    // 加载文件
    var reader = new FileReader();
    reader.onload = cbReaderLoaded;
    reader.readAsArrayBuffer(file);

    // 文件加载完成的回调
    function cbReaderLoaded(e) {
        var binFile = new Uint8Array(reader.result);
        isFileLoading = false;
        var midi = parseMidi(binFile);
        if (midi != null){
            if (midiPlayer != null){
                midiPlayer.stop();
                midiPlayer = null;
            }
            console.log(midi);
            midiPlayer = new MidiPlayer(midi, audioSource);
            midiPlayer.play();
            updateModel(); // 更新3D模型
            //绘制
            render();
        }
        else{
            console.log("midi解析失败！");
        }
    }
}

var isAudioSourceLoaded = false;
var audioSource = {};
/* 加载音源 */
function loadUkuSource(){
    var dir = "resources/uku/";
    for (var i = 0; i < 128; i++){ // 0-127，C-1到G9，60=C4
        var index = (i + 60) % 24;
        var audioFile = dir + (index+1).toString().padStart(2, '0') + '.mp3';
        var audio = new Audio();
        audio.src = audioFile;
        audio.onloadeddata = audioLoadedCallback; // 加载完成的回调
        audio.load();
        audioSource[i] = audio;
    }

    var hasLoadedCount = 0; // 已加载的音频数量
    var espectLoadedCount = 128; // 预计加载的音频数量
    function audioLoadedCallback(){
        hasLoadedCount++;
        if (hasLoadedCount == espectLoadedCount){
            console.log("尤克里里音源加载完成！");
            isAudioSourceLoaded = true;
        }
    }
}

function loadPianoSource(){
    var dir = "resources/piano/";
    for (var i = 0; i < 128; i++){ // 0-127，C-1到G9
        var index = (i + 20) % 88;
        var audioFile = dir + (index+1).toString().padStart(2, '0') + '.mp3';
        var audio = new Audio();
        audio.src = audioFile;
        audio.onloadeddata = audioLoadedCallback; // 加载完成的回调
        audio.load();
        audioSource[i] = audio;
    }

    var hasLoadedCount = 0; // 已加载的音频数量
    var espectLoadedCount = 128; // 预计加载的音频数量
    function audioLoadedCallback(){
        hasLoadedCount++;
        if (hasLoadedCount == espectLoadedCount){
            console.log("钢琴音源加载完成！");
            isAudioSourceLoaded = true;
        }
    }
}

loadUkuSource();
//loadPianoSource();

/* 播放控制 */
var midiPlayer;

function play(){
    if (midiPlayer == null){
        console.log("未加载midi");
        return;
    }

    console.log("播放");
    midiPlayer.play();
}
function pause(){
    if (midiPlayer == null){
        console.log("未加载midi");
        return;
    }

    console.log("暂停");
    midiPlayer.pause();
}
function stop(){
    if (midiPlayer == null){
        console.log("未加载midi");
        return;
    }

    console.log("停止");
    midiPlayer.stop();
}

/* webgl */

var canvas;
var gl;
var program;

// 相机设置
var projectionMode = 1;
const near = 0.01;
const far = 10;

var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;


var up = vec3(0.0, 1.0, 0.0); // y-up

// 参数设置

// var scale = 1.0; //画面缩放
//     var scaleLoc; //画面缩放
//     var scale_step = 0.1; // 缩放灵敏度
//     var scale_max = 1.5; // 缩放最大倍数
//     var scale_min = 0.8; // 缩放最小倍数

// 数据
var pointArray = [];
var colorArray = [];
var vBuffer, cBuffer;

window.onload = function init() {
    canvas = document.getElementById("gl-canvas"); // 获取canvas标签

    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) {
        alert("WebGL不可用");
    }

    gl.viewport(0, 0, canvas.width, canvas.height); // 设置WebGL视口
    gl.clearColor(0.8, 0.8, 0.8, 1.0); // 设置背景色
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.DEPTH_TEST); // 开启深度测试
 
    // 获取模型
    getModel();

    // 链接、调用着色器
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 传输数据
    // 顶点
    vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointArray), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition); //启用对应属性

    // 颜色
    cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colorArray), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray(vColor);
    
    // UBO变量
    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
}

var colorList = [];

var sectionPeroid = 4; // 显示几个小节的音符
function addNoteBlockModel(note, track, start, druation, velocity){
    if (midiPlayer == null) {
        console.log("midi未加载，停止添加音符块");
        return;
    }

    // 横向[0, 1], 纵向[0, maxlength]
    var maxNote = 128;
    var width = 1 / maxNote;
    var tickPeriod = midiPlayer.getTickBySection(sectionPeroid) || 1;

    var left = note * width;
    var right = left + width;
    var bottom = start / tickPeriod;
    var top = bottom + druation / tickPeriod;

    // 横向[-1, 1], 纵向[0, maxlength]
    var left = left * 2 - 1;
    var right = right * 2 - 1;
    var bottom = bottom;
    var top = top;

    // 颜色
    var maxVelocity = 255;
    var colorLight = (velocity / maxVelocity) / 2 + 0.5;
    var color = [colorList[track][0] * colorLight, colorList[track][1] * colorLight, colorList[track][2] * colorLight];
    
    // 添加顶点和颜色
    pointArray.push([left, top, 0.0, left, bottom, 0.0, right, bottom, 0.0, left, top, 0.0, right, bottom, 0.0, right, top, 0.0]);
    colorArray.push(color.concat(color, color, color, color, color));
}

function updateModel(){
    console.log("更新3D模型");
    getModel();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointArray), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colorArray), gl.STATIC_DRAW);
    console.log(pointArray, colorArray);
}

function getModel(){
    pointArray = [];
    colorArray = [];
    colorList = [];
    if (midiPlayer != null){
        // 生成颜色列表
        for(var i = 0; i < midiPlayer.midi.tracks.length; i++){
            var randColor = [Math.random(), Math.random(), Math.random()];
            colorList.push(randColor);
        }
        // 生成顶点
        for(var i = 0; i < midiPlayer.midi.tracks.length; i++){ // 遍历轨道
            var track = midiPlayer.midi.tracks[i];
            var pEvent = 0;
            while(pEvent < track.events.length){ // 搜索所有事件
                var cEvent = track.events[pEvent];
                if ((cEvent.method & 0xf0) == EventType.NOTE_ON){ // 按下音符
                 
                    var pPeekEvent = pEvent;
                    while(1){
                        var cPeekEvent = track.events[pPeekEvent];
                        if(pPeekEvent >= track.events.length){
                            break; // 未找到松开音符，跳过
                        }
                        else if ((cPeekEvent.method & 0xf0) == EventType.NOTE_OFF){
                            var start = cEvent.aTick;
                            var druation = cPeekEvent.aTick - start;
                            var note = cEvent.param1, velocity = cEvent.param2;
                            addNoteBlockModel(note, i, start, druation, velocity);
                            break;
                        }

                        pPeekEvent++;
                    }
                }
                pEvent++;
            }
            
        }
    }
}

function render() {
    if (midiPlayer == null){
        throw("渲染停止，midi还未加载！");
    }

    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // 清楚帧缓存和深度缓冲

    // 投影
    var cTick = midiPlayer.getTickFloat();
    var range = midiPlayer.getTickBySection(sectionPeroid) || 1;
    var eye = vec3(0, cTick, 1);
    var at = vec3(0, cTick, -1);
    projectionMatrix = ortho(-1, 1, 0, range, near, far); // 平行投影
    modelViewMatrix = lookAt(eye, at, up);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // 绘制
    gl.drawArrays(gl.TRIANGLES, 0, flatten(pointArray).length / 3 );

    // 下一帧
    requestAnimFrame(render);
}
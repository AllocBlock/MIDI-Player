/* 公共函数 */
function lerp(a, b, u, accuracy){ // 线性插值
    if (Math.abs(b - a) < accuracy) return b;
    else return a + (b - a) * u; 
}

function angleToDeg(a){
    return a * Math.PI / 180;
}


var isFileLoading = false;
/* 选择文件框 */
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
/* 选择文件 */
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
const up = vec3(0.0, 1.0, 0.0); // y-up

// 相机动态参数
var cPhi = 0.0;
var maxPhi = 15, minPhi = -15;
var tPhi = 0.0; // 目标角度，用于实现平滑过渡



var modelViewMatrixLoc, projectionMatrixLoc, cTickLoc, rangeLoc;
// 参数设置

// var scale = 1.0; //画面缩放
//     var scaleLoc; //画面缩放
//     var scale_step = 0.1; // 缩放灵敏度
//     var scale_max = 1.5; // 缩放最大倍数
//     var scale_min = 0.8; // 缩放最小倍数

// 数据
var pointArray = [];
var colorArray = [];
var normalArray = [];
var markArray = [];
var vBuffer, cBuffer, markBuffer;

window.onload = function(){
    init();
}

function init() {
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
    addPianoKey();

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
    gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    // 法线
    nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normalArray), gl.STATIC_DRAW);

    var vNormal = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal); //启用对应属性

    // 标记, 0一般，1是UI
    markBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, markBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(markArray), gl.STATIC_DRAW);

    var vMark = gl.getAttribLocation(program, "vMark");
    gl.vertexAttribPointer(vMark, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vMark);
    
    // UBO变量
    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
    cTickLoc = gl.getUniformLocation(program, "cTick");
    rangeLoc = gl.getUniformLocation(program, "range");

    render();
}

function render() {
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // 清楚帧缓存和深度缓冲

    cPhi = lerp(cPhi, tPhi, 0.05, 0.1);
    // 计算ubo
    var cTick = midiPlayer != null ? midiPlayer.getTickFloat() : 0.0;
    var range = midiPlayer != null ? (midiPlayer.getTickBySection(sectionPeroid) || 1.0) : 1.0;
    var eye = vec3(Math.sin(angleToDeg(cPhi)), cTick, Math.cos(angleToDeg(cPhi)));
    var at = vec3(0, cTick, 0);
    var projectionMatrix = ortho(-1, 1, 0, range, near, far); // 平行投影
    var modelViewMatrix = lookAt(eye, at, up);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));
    gl.uniform1f(cTickLoc, cTick);
    gl.uniform1f(rangeLoc, range);
    // 绘制
    gl.drawArrays(gl.TRIANGLES, 0, flatten(pointArray).length / 3 );
    // 下一帧
    requestAnimFrame(render);
}

/*
function drawPianoKey(){
    var canvas = document.getElementById("piano-key-canvas");
    console.log(canvas);
    // 128键，从c-1开始
    var note = 0;
    var octave = -1;

    var whiteHeight = 14.4;
    var whiteWidth = 2.2;
    var blackHeight = 9.4;
    var blackWidth = 1.0;
    var interval = 0.1;
    // 
    // 128个键里，包含10个音阶+8个音符
    // 含白键75个，黑键53个
    //
    var octaveWidth = (whiteWidth + interval) * 7;
    var keyboardWidth = (whiteWidth + interval) * 75;

    var keyList = [];
    while(note < 128){
        var key = note % 12;
        var octave = Math.floor(note / 12);
        console.log
        var left, type;
        switch(key){
            case 0:{ // C
                left = octave * octaveWidth;
                type = "white";
                break;
            }
            case 1:{ // #C
                left = octave * octaveWidth + whiteWidth + interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 2:{ // D
                left = octave * octaveWidth + whiteWidth + interval;
                type = "white";
                break;
            }
            case 3:{ // #D
                left = octave * octaveWidth + 2 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 4:{ // E
                left = octave * octaveWidth + 2 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 5:{ // F
                left = octave * octaveWidth + 3 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 6:{ // #F
                left = octave * octaveWidth + 4 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 7:{ // G
                left = octave * octaveWidth + 4 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 8:{ // #G
                left = octave * octaveWidth + 5 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 9:{ // A
                left = octave * octaveWidth + 5 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 10:{ // #A
                left = octave * octaveWidth + 6 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 11:{ // B
                left = octave * octaveWidth + 6 * (whiteWidth + interval);
                type = "white";
                break;
            }
        }

        key = {
            note: note,
            left: left,
            type: type
        }
        keyList.push(key);

        note++;
    }

    // 绘制，先绘制白键，在绘制黑键
    var pen = canvas.getContext("2d");

    var canvasWidth = canvas.width;
    var canvasHeight = canvas.height;

    var scaleX = keyboardWidth / canvasWidth, scaleY = whiteHeight / canvasHeight;
    for(key of keyList){
        if (key.type != "white") continue;
        pen.fillStyle = "#aaa";
        pen.fillRect(key.left / scaleX, 0, whiteWidth / scaleX, whiteHeight / scaleY);
    }

    for(key of keyList){
        if (key.type != "black") continue;
        pen.fillStyle = "#333";
        pen.fillRect(key.left / scaleX, 0, blackWidth / scaleX, blackHeight / scaleY);
    }
}
*/

function addPianoKey(){
    // 128键，从c-1开始
    var note = 0;
    var octave = -1;

    var whiteHeight = 14.4;
    var whiteWidth = 2.2;
    var blackHeight = 9.4;
    var blackWidth = 1.0;
    var interval = 0.1;
    /* 
     * 128个键里，包含10个音阶+8个音符
     * 含白键75个，黑键53个
    */
    var octaveWidth = (whiteWidth + interval) * 7;
    var keyboardWidth = (whiteWidth + interval) * 75;

    var keyList = [];
    while(note < 128){
        var key = note % 12;
        var octave = Math.floor(note / 12);
        console.log
        var left, type;
        switch(key){
            case 0:{ // C
                left = octave * octaveWidth;
                type = "white";
                break;
            }
            case 1:{ // #C
                left = octave * octaveWidth + whiteWidth + interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 2:{ // D
                left = octave * octaveWidth + whiteWidth + interval;
                type = "white";
                break;
            }
            case 3:{ // #D
                left = octave * octaveWidth + 2 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 4:{ // E
                left = octave * octaveWidth + 2 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 5:{ // F
                left = octave * octaveWidth + 3 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 6:{ // #F
                left = octave * octaveWidth + 4 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 7:{ // G
                left = octave * octaveWidth + 4 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 8:{ // #G
                left = octave * octaveWidth + 5 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 9:{ // A
                left = octave * octaveWidth + 5 * (whiteWidth + interval);
                type = "white";
                break;
            }
            case 10:{ // #A
                left = octave * octaveWidth + 6 * (whiteWidth + interval) - interval / 2 - blackWidth / 2;
                type = "black";
                break;
            }
            case 11:{ // B
                left = octave * octaveWidth + 6 * (whiteWidth + interval);
                type = "white";
                break;
            }
        }

        key = {
            note: note,
            left: left,
            type: type
        }
        keyList.push(key);

        note++;
    }

    // 绘制
    for(key of keyList){

        // 横向[0, 1], 纵向[0, 1]
        var left = key.left / keyboardWidth;
        var top = 1;
        if (key.type == "white"){
            var right = (key.left + whiteWidth) / keyboardWidth;
            var bottom = 0;
        }
        else{
            var right = (key.left + blackWidth) / keyboardWidth;
            var bottom = 1 - blackHeight / whiteHeight;
        }

        if (key.type == "white"){
            var color = [1, 1, 1];
            var height = 0.01;
        }
        else{
            var color = [0, 0, 0];
            var height = 0.015;
        }

        // 横向[-1, 1], 纵向[0, 1]
        left = left * 2 - 1;
        right = right * 2 - 1;
            

        // 添加顶点和颜色
        var p0 = vec3(left, top, height);
        var p1 = vec3(left, bottom, height);
        var p2 = vec3(right, bottom, height);
        var p3 = vec3(right, top, height);
        var p4 = vec3(left, top, 0);
        var p5 = vec3(left, bottom, 0);
        var p6 = vec3(right, bottom, 0);
        var p7 = vec3(right, top, 0);

        var nFront = vec3(0, 0, 1);
        var nLeft = vec3(-1, 0, 0);
        var nRight = vec3(1, 0, 0);

        pointArray.push([].concat(p0, p1, p2, p0, p2, p3).concat(p4, p5, p1, p4, p1, p0).concat(p3, p2, p6, p3, p6, p7));
        colorArray.push([].concat(color, color, color, color, color, color).concat(color, color, color, color, color, color).concat(color, color, color, color, color, color));
        normalArray.push([].concat(nFront, nFront, nFront, nFront, nFront, nFront).concat(nLeft, nLeft, nLeft, nLeft, nLeft, nLeft).concat(nRight, nRight, nRight, nRight, nRight, nRight));
        markArray.push([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    }
}



var colorList = [];

var sectionPeroid = 4; // 显示几个小节的音符
function addNoteBlockModel(note, track, start, druation, velocity){
    if (midiPlayer == null) {
        console.log("midi未加载，停止添加音符块");
        return;
    }

    // 横向[0, 1], 纵向[0, maxTick]
    var maxNote = 128;
    var width = 1 / maxNote;

    var left = note * width;
    var right = left + width;
    var bottom = start;
    var top = bottom + druation;

    // 横向[-1, 1], 纵向[0, maxTick]
    left = left * 2 - 1;
    right = right * 2 - 1;

    // 颜色
    var maxVelocity = 255;
    var colorLight = (velocity / maxVelocity) / 2 + 0.5;
    var color = [colorList[track][0] * colorLight, colorList[track][1] * colorLight, colorList[track][2] * colorLight];
    
    // 添加顶点和颜色
    var height = 0.009;
    var p0 = vec3(left, top, height);
    var p1 = vec3(left, bottom, height);
    var p2 = vec3(right, bottom, height);
    var p3 = vec3(right, top, height);
    var p4 = vec3(left, top, 0);
    var p5 = vec3(left, bottom, 0);
    var p6 = vec3(right, bottom, 0);
    var p7 = vec3(right, top, 0);

    var nFront = vec3(0, 0, 1);
    var nLeft = vec3(-1, 0, 0);
    var nRight = vec3(1, 0, 0);

    pointArray.push([].concat(p0, p1, p2, p0, p2, p3).concat(p4, p5, p1, p4, p1, p0).concat(p3, p2, p6, p3, p6, p7));
    colorArray.push([].concat(color, color, color, color, color, color).concat(color, color, color, color, color, color).concat(color, color, color, color, color, color));
    normalArray.push([].concat(nFront, nFront, nFront, nFront, nFront, nFront).concat(nLeft, nLeft, nLeft, nLeft, nLeft, nLeft).concat(nRight, nRight, nRight, nRight, nRight, nRight));
    markArray.push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function addNote(){
    
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

function updateModel(){
    //console.log("更新3D模型");
    pointArray = [];
    colorArray = [];
    normalArray = [];
    markArray = [];

    addPianoKey(); // 添加钢琴

    // 生成颜色列表
    colorList = [];
    for(var i = 0; i < midiPlayer.midi.tracks.length; i++){
        var randColor = [Math.random(), Math.random(), Math.random()];
        colorList.push(randColor);
    }
    addNote(); // 添加音符

    // 更新buffer数据
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointArray), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colorArray), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normalArray), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, markBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(markArray), gl.STATIC_DRAW);

    // 输出
    //console.log(pointArray, colorArray, markArray);
}

function updatePhi(value){
    tPhi = parseFloat(value);
}
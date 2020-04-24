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
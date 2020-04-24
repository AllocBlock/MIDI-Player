var isFileLoading = false;
/* 选择文件 */
function clickFileSelect(e){
    // 如果正在加载，则暂时禁止选择文件
    if (isFileLoading){
        console.log("正在加载前一个文件");
        return;
    }
    e.value = "";
}

function clickFileSelected(e){
    readFile(e.files[0]);
    
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
            midiPlayer = new MidiPlayer(midi);
            midiPlayer.play();
        }
        else{
            console.log("midi解析失败！");
        }
    }
}

var midiNote = {};
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
        midiNote[i] = audio;
    }

    var hasLoadedCount = 0; // 已加载的音频数量
    var espectLoadedCount = 128; // 预计加载的音频数量
    function audioLoadedCallback(){
        hasLoadedCount++;
        if (hasLoadedCount == espectLoadedCount){
            console.log("尤克里里音源加载完成！");
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
        midiNote[i] = audio;
    }

    var hasLoadedCount = 0; // 已加载的音频数量
    var espectLoadedCount = 128; // 预计加载的音频数量
    function audioLoadedCallback(){
        hasLoadedCount++;
        if (hasLoadedCount == espectLoadedCount){
            console.log("钢琴音源加载完成！");
        }
    }
}
loadUkuSource();
//loadPianoSource();

class MidiPlayer{
    constructor(midi) {
        this.midi = midi;
        this.cTick = 0;
        this.lastTick = [];
        this.pEvent = [];
        for (var i = 0; i < this.midi.header.ntrack; i++){
            this.lastTick.push(0);
            this.pEvent.push(0);
        }
        console.log(midi);
    }

    runEvent(player, e){
        switch(e.method & 0xf0){
            case EventType.NOTE_ON:{
                console.log("event: play note ", e.param1, ", veclocity: ", e.param2);
                midiNote[e.param1].volume = e.param2 / 255;
                if (midiNote[e.param1].paused){
                    midiNote[e.param1].play();
                }
                else{
                    midiNote[e.param1].currentTime = 0;
                }
                break;
            }
            case EventType.SYSEX_OR_META_EVENT:{
                if (e.method == 0xff){ // 元事件
                    switch(e.metaType){
                        case 0x51:{ // Tempo change

                            var usPerTap = (e.data[0] << 16) + (e.data[1] << 8) + e.data[2];
                            if (player.midi.header.division >> 7 == 0){ // tick模式
                                console.log(e.data, usPerTap, player.midi.header.division, player.midi.header.division & 0x7f, usPerTap / (player.midi.header.division & 0x7f));
                                player.msPerTick = usPerTap / (player.midi.header.division & 0x7f) / 1000;
                            }
                            else{
                                console.log("SYSEX not supported yet");
                            }
                            
                            console.log("event: change tempo, msPerTick = ", player.msPerTick);
                            break;
                        }
                    }
                }
            }
        }
    }

    tick(player){
        if (player.inPlaying){
            setTimeout(player.tick, player.msPerTick, player);
        }
        //console.log("tick ", player.cTick);
        for (var i = 0; i < player.midi.header.ntrack; i++){
            var cEvent = player.midi.tracks[i].events[player.pEvent[i]];
            while(player.pEvent[i] < player.midi.tracks[i].events.length && player.cTick - player.lastTick[i] == cEvent.dTime){ // 触发当前事件
                //console.log("track[", i, "] event ", cEvent);
                player.runEvent(player, cEvent);
                player.lastTick[i] = player.cTick;
                player.pEvent[i]++;
                cEvent = player.midi.tracks[i].events[player.pEvent[i]];
            }
        }
        player.cTick++;
    }

    play(){
        console.log("play");
        this.msPerTick = 10;
        this.inPlaying = true;
        this.tick(this);
    }

    pause(){
        this.inPlaying = false;
    }

    stop(){
        this.pause();
        this.cTick = 0;
        this.lastTick = [];
        this.pEvent = [];
        for (var i = 0; i < this.midi.header.ntrack; i++){
            this.lastTick.push(0);
            this.pEvent.push(0);
        }
    }
}

/* 播放控制 */
var midiPlayer;
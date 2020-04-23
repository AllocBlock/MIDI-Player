#include <fstream>
#include <vector>
#include <iostream>
#include <iomanip>

namespace MIDI {

    enum MIDIResult {
        SUCCESS = 0x00,
        FAIL_OPEN_FILE = 0x01,
        FAIL_PARSE_FILE = 0x02
    };

    class Header
    {
    public:
        char type[4]; // MThd
        uint32_t length; // header���ݳ��ȣ���6�ֽ�
        uint16_t format; // midi�����ͣ�0�������������1����ͬ������������2����˳���죨�൱�ڶ���������죿��������
        uint16_t ntrack; // �������
        uint16_t division; // ʱ���ʽ�����λΪ0����tick��ʱ��ʣ�µ�λ��ʾһ���ķ�����������ticks�������λΪ1����SMPTE��ʱ����7λ�ø�����ʾSMPTE��׼����8λ��ʾÿһ֡��ռ��ticks��
    };

    enum EventType {
        NOTE_OFF = 0x80,
        NOTE_ON = 0x90,
        NOTE_AFTERTOUCH = 0xA0,
        CONTROL_CHANGE = 0xB0,
        PROGRAM_CHANGE = 0xC0, // �ı�������
        CHANNEL_PRESSURE = 0xD0,
        PITCH_WHEEL_CHANGE = 0xE0,
        SYSEX_OR_META_EVENT = 0xF0
    };

    enum EventMetaType {

    };

    class Event
    {
    public:
        uint64_t dTime;
        char method;
        EventType eventType;
    };

    class EventMidi : public Event {
    public:
        char param1, param2;
    };

    class EventSysex : public Event {
    public:
        char param1, param2;
    };

    class EventMeta : public Event {
    public:
        EventMetaType type;
        uint64_t length;
        std::vector<char> data;
    };

    struct Track
    {
        char type[4]; // MThd
        uint32_t length; // header���ݳ��ȣ���6�ֽ�
        std::vector<Event*> events;
    };

    class FileReader {
    private:
        std::fstream f;
    public:
        void open(std::string fileName, int openmode) {
            f.open(fileName.c_str(), openmode);
        }

        void close() {
            f.close();
        }

        
        void read(char* mem, int num) {
            f.read(mem, num);
        }

        char readChar() {
            char res;
            f.read(&res, 1);
            return res;
        }

        char peek() {
            char res = f.peek();
            return res;
        }

        uint16_t readuInt16() {
            // ��ˣ�
            uint16_t res;
            f.read((char*)&res + 1, 1);
            f.read((char*)&res, 1);
            return res;
        }

        uint32_t readuInt32() {
            // ��ˣ�
            uint32_t res;
            f.read((char*)&res + 3, 1);
            f.read((char*)&res + 2, 1);
            f.read((char*)&res + 1, 1);
            f.read((char*)&res, 1);
            return res;
        }

        uint64_t readVLQ() {
            // ��̬�ֽ� Variable Length Quantity
            // ��ˣ�
            uint64_t res = 0;
            char t;
            while (1) {
                f.read(&t, 1);
                res = (res << 7) + (t & 0x7f);
                if (t >= 0 || f.eof()) {
                    break;
                }
            }
           
            return res;
        }

        std::streampos tellg() {
            return f.tellg();
        }


        bool is_open() {
            return f.is_open();
        }

        bool eof() {
            return f.eof();
        }
    };

    std::string charToEventName(char eventType) {
        switch (eventType & 0xf0)
        {
        case NOTE_OFF:
            return "NOTE_OFF";
        case NOTE_ON:
            return "NOTE_ON";
        case NOTE_AFTERTOUCH:
            return "NOTE_AFTERTOUCH";
        case CONTROL_CHANGE:
            return "CONTROL_CHANGE";
        case PROGRAM_CHANGE:
            return "PROGRAM_CHANGE";
        case CHANNEL_PRESSURE:
            return "CHANNEL_PRESSURE";
        case PITCH_WHEEL_CHANGE:
            return "PITCH_WHEEL_CHANGE";
        case SYSEX_OR_META_EVENT:
            return "SYSEX_OR_META_EVENT";
        default:
            return "EVENT_NOT_FOUND";
        }

    }

    class Midi {
    private:
        std::string fileName;
        Header header;
        std::vector<Track> tracks;
    public:
        MIDIResult parse(std::string fileName) {
            this->fileName = fileName;
            // ���ļ�
            FileReader f;
            f.open(fileName, std::ios::in | std::ios::binary);
            if (!f.is_open()) {
                return MIDIResult::FAIL_OPEN_FILE;
            }
            // ��ȡheader
            f.read(header.type, 4);
            header.length = f.readuInt32();
            header.format = f.readuInt16();
            header.ntrack = f.readuInt16();
            header.division = f.readuInt16();

            // ��ȡ��Ƶ��
            for (int i = 0; i < (int)header.ntrack; i++) {
                Track track;
                // ��Ƶ����Ϣ
                f.read(track.type, 4);
                track.length = f.readuInt32();
                std::streampos target = f.tellg() + (std::streampos)track.length;
                // ��ȡ��Ƶ����
                while (target > f.tellg()) {
                    /*if (f.eof()) {
                        break;
                    }*/
                    
                    uint64_t dTime = f.readVLQ();
                    char method = f.readChar();
                    // AX��Aָ��������X��ʾĿ����
                    switch (method & 0xF0)
                    {
                    case NOTE_OFF: // �ɿ����� | ������ ����
                    case NOTE_ON: // �������� | ������ ����
                    case NOTE_AFTERTOUCH: // �������� | ������ ����
                    case CONTROL_CHANGE: // �������仯 | ���������� ����������
                    case PITCH_WHEEL_CHANGE: // �����ֱ任 | ���ֽ� ���ֽ�
                    {
                        char param1, param2;
                        param1 = f.readChar();
                        param2 = f.readChar();

                        EventMidi* event = new EventMidi();
                        event->dTime = dTime;
                        event->method = method;
                        event->param1 = param1;
                        event->param2 = param2;

                        track.events.push_back(event);
                        break;
                    }
                    case PROGRAM_CHANGE: // �ı����� | ��������
                    case CHANNEL_PRESSURE: // ͨ������ѹ�� | ѹ����С
                    {
                        char param1;
                        param1 = f.readChar();

                        EventMidi* event = new EventMidi();
                        event->dTime = dTime;
                        event->method = method;
                        event->param1 = param1;

                        track.events.push_back(event);
                        break;
                    }
                    case SYSEX_OR_META_EVENT: // sysex event or meta event
                    {
                        if (method == (char)0xff) { // Ԫ�¼�
                            
                            EventMetaType type = (EventMetaType)f.readChar(); // ����
                            uint64_t length; // ���ݳ���
                            if (type == 0x00) { // ���ù������ֻ�������ݳ����ֶ������ֽڣ��������Ƕ�̬�ֽ�
                                length = (uint64_t)f.readuInt16();
                            }
                            else {
                                length = f.readVLQ();
                            }
                            char* data = new char[length];
                            if (length > 0) { // ������Ȳ�Ϊ0
                                f.read(data, length); // ����
                            }

                            EventMeta* event = new EventMeta();
                            event->dTime = dTime;
                            event->method = method;
                            event->type = type;
                            event->length = length;
                            for (int j = 0; j < length; j++)
                                event->data.push_back(data[j]);

                            track.events.push_back(event);
                        }
                        break;
                    }
                    default:
                    {
                        throw "type not found";
                        break;
                    }
                    }
                    

                    
                }
                tracks.push_back(track);
            }

            // �ر��ļ�
            f.close();
        }

        char decToHex(int n) {
            n = n % 16;
            switch (n)
            {
            case 0:
                return '0';
            case 1:
                return '1';
            case 2:
                return '2';
            case 3:
                return '3';
            case 4:
                return '4';
            case 5:
                return '5';
            case 6:
                return '6';
            case 7:
                return '7';
            case 8:
                return '8';
            case 9:
                return '9';
            case 10:
                return 'A';
            case 11:
                return 'B';
            case 12:
                return 'C';
            case 13:
                return 'D';
            case 14:
                return 'E';
            case 15:
                return 'F';
            default:
                return 'X';
            }
        }

        std::string charToHex(char n) {
            std::string res;
            if (n > 0) res = "0";
            else {
                res = decToHex((unsigned char)n >> 4);
            }
            res += decToHex(n & 0x0f);
            return res;
        }

        void print() {
            // ͷ��
            std::cout << "midi�ļ���" << fileName << std::endl;
            std::cout << "ͷ��" << std::endl;
            std::cout << "\t���ͣ�" << header.type[0] << header.type[1] << header.type[2] << header.type[3] << std::endl;
            std::cout << "\t���ȣ�" << header.length << std::endl;
            std::cout << "\t��ʽ��" << (header.format == 0 ? "���������" : (header.format == 1 ? "ͬ����������" : "˳���������")) << std::endl;
            std::cout << "\t���������" << header.ntrack << std::endl;
            std::cout << "\tϸ�ַ�ʽ��" << ((header.division & 0x80) == 0 ? "tick" : "SMPTE") << std::endl;
            // ��Ƶ��
            std::cout << "��Ƶ�飺" << std::endl;
            for (int i = 0; i < tracks.size(); i++) {
                std::cout << "��Ƶ��[" << i+1 << "]" << std::endl;
                Track &track = tracks[i];
                // ��Ƶ����Ϣ
                std::cout << "\t���ͣ�" << track.type[0] << track.type[1] << track.type[2] << track.type[3] << std::endl;
                std::cout << "\t���ȣ�" << track.length << std::endl;
                // ��Ƶ����
                std::cout << "\t�¼���" << std::endl;
                for (int j = 0; j < track.events.size(); j++) {
                    Event* event = track.events[j];
                    std::cout << "\t\tʱ�䣺" << std::setw(4) << event->dTime;
                    std::cout << "\t������" << charToEventName(event->method);
                    std::cout << "\t������";
                    switch (event->method & 0xF0)
                    {
                    case NOTE_OFF: // �ɿ����� | ������ ����
                    case NOTE_ON: // �������� | ������ ����
                    case NOTE_AFTERTOUCH: // �������� | ������ ����
                    case CONTROL_CHANGE: // �������仯 | ���������� ����������
                    case PITCH_WHEEL_CHANGE: // �����ֱ任 | ���ֽ� ���ֽ�
                    {
                        std::cout << charToHex(((EventMidi*)event)->param1) << " " << charToHex(((EventMidi*)event)->param2);
                        break;
                    }
                    case PROGRAM_CHANGE: // �ı����� | ��������
                    case CHANNEL_PRESSURE: // ͨ������ѹ�� | ѹ����С
                    {
                        std::cout << charToHex(((EventMidi*)event)->param1);
                        break;
                    }
                    case SYSEX_OR_META_EVENT: // sysex event or meta event
                    {
                        if (event->method == (char)0xff) { // Ԫ�¼�
                            std::cout << "���ͣ�" << charToHex(((EventMeta*)event)->type)<< " " << "���ȣ�" << ((EventMeta*)event)->length;
                        }
                        break;
                    }
                    default:
                    {
                        throw "type not found";
                        break;
                    }
                    }
                    std::cout << std::endl;
                }
            }
        }
    };
}

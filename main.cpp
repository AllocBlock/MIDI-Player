#include <iostream>
#include "include/midi.h"

using namespace std;
using namespace MIDI;
int main()
{   
    Midi m;
    m.parse("resources/test.mid");
    m.print();
;}

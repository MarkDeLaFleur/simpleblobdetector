# simpleblobdetector clone of JP's opencv port to javascript since it's not included in opencvjs. He added a process to enhance performance. 
# I cloned it simply to be able to make an npm package. From VS I ran npm init, then edited the  package.json file adding:
 "repository": {
    "type": "git",
    "url": "git+https://github.com/MarkDeLaFleur/simpleblobdetector.git"
  },
 after that I ran npm install https://github.com/markdelafleur/simpleblobdetector.git
 and in my other project directory it added a folder to node_modules as @markdelafleur/simpleblobdetector
 which was then put into my code with a
 import simpleblobdetector from "@markdelafleur/simpleblobdetector
 which is where all my other svelte imports are ( see my other repository --svelte/verkit

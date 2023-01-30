const puppeteer = require('puppeteer');
const fs  = require('fs');
const { SlowBuffer } = require('buffer');
const util = require('util');
const { url } = require('inspector');

//Permet de gérer des prompts en console
const prompt = require('prompt-sync')();

//Site a vérifier
let websiteUrl = "";
let task = "";

const urlList = [];
const urlTestedList = [];
const imgList = [];

//Récupération des infos en console
while(websiteUrl === ""){
    websiteUrl = prompt('URL du site à vérifier ? (sans http/s) : ');
  }
while(task === ""){
  task = prompt('Element à vérifier ? img/css : ');
}

urlList.push('https://'+websiteUrl+'/')

function isBase64(str) {
    try {
        return btoa(atob(str)) == str;
    } catch (err) {
        return false;
    }
}

function mergeArrays(...arrays) {
    let jointArray = []

    arrays.forEach(array => {
        jointArray = [...jointArray, ...array]
    })
    const uniqueArray = jointArray.reduce((newArray, item) =>{
        if (newArray.includes(item)){
            return newArray
        } else {
            return [...newArray, item]
        }
    }, [])
    return uniqueArray
}

//Récupération des URL

const getAllUrl = async (browser, websiteUrl, urlList) => {
    if(urlList.length > 0){
        let page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0); 
        const url = urlList.shift();
        if(url){
            if(urlTestedList.includes(url)){
                return getAllUrl(browser, websiteUrl, urlList);
            }
            console.log('Check de l\'url : '+url);
            try {
                await page.goto(url);
            } catch (err) {
                console.error(err.message);
                return getAllUrl(browser, websiteUrl, urlList);
            }
            //Gestion de la page actu avec infinite scroll
            if(url === `https://${websiteUrl}/blog/`){
                await page.evaluate(() => new Promise((resolve) => {
                    var scrollTop = -1;
                    const interval = setInterval(() => {
                      window.scrollBy(0, 100);
                      if(document.documentElement.scrollTop !== scrollTop) {
                        scrollTop = document.documentElement.scrollTop;
                        return;
                      }
                      clearInterval(interval);
                      resolve();
                    }, 200);
                }));
            }
            await page.waitForSelector('body');
            const allHrefs = await page.evaluate((websiteUrl) => {
                let selector = 'a[href^="https://'+websiteUrl+'/"], a[href^="/"]';
                console.log(selector);
                return Array.from(document.querySelectorAll(`${selector}`),link => {
                    if(link.href.match(/(?!.+\.pdf$).+$/)) return link.href
                })
            },websiteUrl);
            const allDataUrls = await page.evaluate((websiteUrl) => {
                return Array.from(document.querySelectorAll('[data-url]'), element =>{
                        const dataUrl = element.getAttribute('data-url');
                            if(dataUrl.includes(websiteUrl) && !dataUrl.startsWith('#') && !dataUrl.startsWith('mailto') && !dataUrl.includes('linkedin.com') && !dataUrl.includes('facebook.com') && !dataUrl.includes('twitter.com') && !dataUrl.includes('plus.google.com') && !dataUrl.includes('.pdf')){
                                return dataUrl;
                            } else {
                                return ;
                            } 
                    })    
            },websiteUrl);
            urlList = mergeArrays(urlList,allHrefs,allDataUrls);
            urlTestedList.push(url)
            console.log('Liste url : '+urlList.length)
            console.log('Liste url finale : '+urlTestedList.length)
            await page.close();
            return getAllUrl(browser, websiteUrl, urlList);
        }else{
            return getAllUrl(browser, websiteUrl, urlList);
        }
    } else {
        console.log("scrap terminé")
        return [urlTestedList];
    }
}

//Analyse des images

const crawlImg = async (browser, urlTestedList, imgList) => {
    
    if(urlTestedList.length > 0){
        let page = await browser.newPage();
        const url = urlTestedList.shift();
        if(url){
            try {
                await page.goto(url);
            } catch (err) {
                console.error(err.message);
                return crawlImg(browser, urlTestedList, imgList);
            }
            //Récupération des images
            const imgSrcs = await page.evaluate(() => {
                //Récupération des balises img
                const allImages = document.querySelectorAll("img")
                let tempArray = [];
                allImages && allImages.forEach(img => {
                    if(img.getAttribute("src") && !(img.getAttribute("src")).includes('svg') && !(img.getAttribute("src")).includes('.bing') && !tempArray.includes(img.getAttribute("src"))){
                        tempArray.push(img.getAttribute("src"))

                    }
                })
                //Récupération des bg-image
                const regex = /background-image.+?\((.+?)\)/gi;
                const allBgImages = document.body.innerHTML.match(regex)
                console.log(allBgImages)
                allBgImages && allBgImages.map(function(e){
                    if(!tempArray.includes(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,'')) && !(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,'')).includes('svg') && !(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,'')).includes('.bing')){
                        tempArray.push(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,''))
                    }
                });
                return tempArray
            });
            console.log("Page analysée");
            imgSrcs.forEach(img =>{
                console.log(img)
                if(!imgList.includes(img)){
                    imgList.push(img)
                }
            })
            console.log('nombre images : '+imgList.length)
            await page.close();
            return crawlImg(browser, urlTestedList, imgList);
        }else{
            return crawlImg(browser, urlTestedList, imgList);
        }
    } else {
        console.log("scrap des images terminé")
        console.log(imgList)
        return [imgList];
    }
}
//-------------------------------------------------------------------------------------------------//
//------------------------------------Analyse du CSS-----------------------------------------------//
//-------------------------------------------------------------------------------------------------//

const getAllStylesheets = async(browser, urlList, stylesUrl, stylesContent) => {
    let newUrlList = [...urlList];
    if(newUrlList.length > 0){
        let page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0);
        const url = newUrlList.shift();
        page.on('response',async response => {
            if(response.request().resourceType() === 'stylesheet') {
                //TODO trycatch par ici je crois ?
                try {
                    const styleContent = await response.text();
                    stylesContent += styleContent;

                    const url = await response.url();
                    if(!stylesUrl.includes(url)) stylesUrl.push(url);
                } catch (error){
                    console.log('Erreur de lecture de : '+ url);
                    console.log(error);
                }   
            }
        });
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            console.log('Check de la page : '+url);
            return getAllStylesheets(browser, newUrlList, stylesUrl, stylesContent);
        } catch (err) {
            console.error(err.message);
            return getAllStylesheets(browser, newUrlList, stylesUrl, stylesContent);
        }
    } else {
        return [stylesUrl, stylesContent];
    }
}

const verifyCss = async (browser, urlList, stylesContent, arrayCssUnused = [], arrayCssUsed = []) => {
    let newUrlList = [...urlList];
    if(newUrlList.length > 0){
        const cssUsed = stylesContent.match(/\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*\s*\{/gm);
            if(cssUsed != null || cssUsed != undefined){
                // console.log('\t check du css');
                let page = await browser.newPage();
                await page.setDefaultNavigationTimeout(0);
                const url = newUrlList.shift();
                console.log('Analyse CSS pour '+url);
                const cssUsedCleaned = cssUsed.map(className => className.replace(/{/,'').replace(' ',''));
                try {
                    await page.goto(url);
                } catch(e){
                    console.log('A');
                    console.log(e);
                }

                try {
                    await page.waitForSelector('body');
                } catch(e){
                    console.log('B');
                    console.log(e);
                }

                try {
                    const tests = await page.evaluate(elementsPassed => {
                        let arrayCssUsedTemp = elementsPassed[1];
                        let arrayCssUnusedTemp = elementsPassed[2];
                        elementsPassed[0].forEach( selector => {
                            const isPresent = [...document.querySelectorAll(selector)];
                            if(isPresent != undefined && isPresent.length > 0){
                                arrayCssUsedTemp.push(selector);
                                const index = arrayCssUnusedTemp.indexOf(selector);
                                if (index > -1) {
                                    arrayCssUnusedTemp.splice(index, 1);
                                }
                            } else {
                                if(!arrayCssUnusedTemp.includes(selector)){
                                    arrayCssUnusedTemp.push(selector);
                                } 
                            }
                        });
                        return [arrayCssUsedTemp, arrayCssUnusedTemp];
                    }, [cssUsedCleaned, arrayCssUsed, arrayCssUnused]);
      
                    arrayCssUsed = [...new Set([...arrayCssUsed,...tests[0]])];
                    arrayCssUnused = [...new Set([...arrayCssUnused,...tests[1]])];
                } catch (e){
                    console.log('C');
                    console.log(e);
                }
                 
                try {
                    await page.close();
                } catch(e){
                    console.log('D');
                    console.log(e);
                }
                
            } 
        return verifyCss(browser, newUrlList, stylesContent, arrayCssUnused, arrayCssUsed)
    } else {
        return [arrayCssUnused, arrayCssUsed];
    }
}

const checkCss = async (page, arrayCssUsed, arrayCssUnused, styles) => {
    styles.forEach(async function(styleOfCss) {
            const cssUsed = styleOfCss.match(/\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*\s*\{/gm);
            if(cssUsed != null || cssUsed != undefined){
                // console.log('\t check du css');
                let tempClassChecked = [];
                cssUsed.forEach(async function(cssClassName){
                    const classNamePurified = cssClassName.replace(/{/,'');
                    // console.log('Check de '+classNamePurified);
                    if(arrayCssUsed.includes(classNamePurified) || tempClassChecked.includes(classNamePurified)){
                        // console.log('déjà dans l array : ' + classNamePurified);
                        // return;
                    } else {
                        // console.log('Check selector ' + classNamePurified);
                        tempClassChecked.push(classNamePurified);
                        try {
                            const tests = await page.evaluate(selector =>{
                                return [...document.querySelectorAll(selector)];
                            }, classNamePurified);
                            // return process.kill(process.pid);
                            if(tests != undefined && tests.length > 0){
                                // console.log(classNamePurified + ' ajouté à la liste des CSS utilisés');
                                arrayCssUsed.push(classNamePurified);
                                const index = arrayCssUnused.indexOf(classNamePurified);
                                if (index > -1) {
                                    arrayCssUnused.splice(index, 1);
                                }
                                // return;
                            } else {
                                // console.log(classNamePurified + ' non utilisé');
                                if(arrayCssUnused.includes(classNamePurified)){
                                    // return;
                                } else {
                                    arrayCssUnused.push(classNamePurified);
                                    // return;
                                }
                            }
                        } catch(error){
                            console.log(error);
                        }
                    }
                });
            }
    });

}




//-------------------------------------------------------------------------------------------------//


//Fonction principale
const scrap = async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--shm-size=3gb'] });

    //Lancement du script choisi
    // ...............
    //.........

    //Récupération URL
    const pages = await getAllUrl(browser, websiteUrl, urlList);
    console.log('Récupération des urls des pages terminée');
    const images = await crawlImg(browser, pages[0], imgList)
    console.log(images.length)
    console.log(images)
    browser.close();
    return images;
}

scrap()
  .then(value => {
        console.log('Script terminé.');
        console.log(value)
        //Write to csv
        fs.writeFile("urlList.txt", JSON.stringify(value), "utf-8", (err) => {
            if (err) console.log(err);
            else console.log("Url list saved");
        });


  })
  .catch(e => console.log(`error: ${e}`))


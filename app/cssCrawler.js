const puppeteer = require('puppeteer');
const fs  = require('fs');
const { SlowBuffer } = require('buffer');
const util = require('util');
const { url } = require('inspector');




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

const getAllUrl = async (browser, urlList, urlListCrawled, arrayCssUsed, arrayCssUnused) => {
    if(urlList.length > 0){
        let page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0);
        const url = urlList.shift();
        let styles = [];
        if(urlListCrawled.includes(url)){
            return getAllUrl(browser, urlList, urlListCrawled, arrayCssUsed, arrayCssUnused);
        }
        console.log('Check de l\'url : '+url);
        page.on('response',async response => {
            if(response.request().resourceType() === 'stylesheet') {
                //TODO trycatch par ici je crois ?
                const url = await response.url();
                try {
                    const styleContent = await response.text();
                    styles.push(styleContent);
                } catch (error){
                    console.log('Erreur de lecture de : '+ url);
                }
                
            }
        });
        try {
            await page.goto(url);
        } catch (err) {
            console.error(err.message);
            return getAllUrl(browser, urlList, urlListCrawled, arrayCssUsed, arrayCssUnused);
        }
        await page.waitForSelector('body');
        const allHrefs = await page.evaluate(() =>
            [...document.querySelectorAll('a[href^="https://www.la-loi-pinel.com/"], a[href^="/"]')].map(link => link.href)
        );
        const allDataUrls = await page.evaluate(() => 
                [...document.querySelectorAll('[data-url]')].map(function(element){
                    const dataUrl = element.getAttribute('data-url');
                    // if(isBase64(dataUrl) == false){
                        if(dataUrl.includes('www.la-loi-pinel.com') && !dataUrl.startsWith('#') && !dataUrl.startsWith('mailto') && !dataUrl.includes('linkedin.com') && !dataUrl.includes('facebook.com') && !dataUrl.includes('twitter.com') && !dataUrl.includes('plus.google.com')){
                            return dataUrl;
                        } else {
                            return ;
                        } 
                    // } else {
                    //     let decodeUrl = atob(dataUrl);
                    //     if(decodeUrl.startsWith('/')){
                    //         decodeUrl = 'http://local.selexium.com' + decodeUrl;
                    //     }
                    //     if(decodeUrl.includes('local.selexium.com') && !decodeUrl.startsWith('#') && !decodeUrl.startsWith('mailto') && !decodeUrl.includes('linkedin.com') && !decodeUrl.includes('facebook.com') && !decodeUrl.includes('twitter.com') && !dataUrl.includes('plus.google.com')){
                    //         return decodeUrl;
                    //     } else {
                    //         return ;
                    //     } 
                    // }
                })    
        );

        // console.log(util.inspect(allHrefs, { maxArrayLength: null }))
        // return process.kill(process.pid);
        
        urlListCrawled.push(url);
        urlList = mergeArrays(urlList,allHrefs,allDataUrls);

        await checkCss(page, arrayCssUsed, arrayCssUnused, styles);

        await page.close();
        // if(urlList.length > 200){
        //     urlList = [];
        // }
        return getAllUrl(browser, urlList, urlListCrawled, arrayCssUsed, arrayCssUnused);
    } else {
        return [urlListCrawled, arrayCssUsed, arrayCssUnused];
    }
}

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


const scrap = async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--shm-size=3gb'] });
    let stylesUrl = [];
    let stylesContent = '';
    let urlList = JSON.parse(fs.readFileSync('./urlList.txt', 'utf8'));;
    // const result = await getAllUrl(browser, urlList, urlListCrawled, arrayCssUsed, arrayCssUnused);
    // console.log(urlList);
    const stylesheets = await getAllStylesheets(browser, urlList, stylesUrl, stylesContent);
    console.log('Récupération des stylesheets terminée.');
    // console.log(urlList);
    console.log('Début du traitement du style...');
    const verifiedCss = await verifyCss(browser, urlList, stylesheets[1]);
    console.log('Fin du traitement du style.');
    browser.close();
    return verifiedCss;
}

scrap()
  .then(value => {
        console.log('Script terminé.');
        // console.log(value[0]);
        // fs.writeFileSync('./pagesCrawled.txt', value[0].join ('\n') , {flag: "w"});
        fs.writeFileSync('./classUsed.txt', value[1].join ('\n') , {flag: "w"});
        fs.writeFileSync('./classPasUsed.txt', value[0].join ('\n') , {flag: "w"});
  })
  .catch(e => console.log(`error: ${e}`))

